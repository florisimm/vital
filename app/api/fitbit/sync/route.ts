import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const HEALTH_BASE = 'https://health.googleapis.com/v4/users/me/dataTypes'

async function getValidToken(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string): Promise<string | null> {
  const { data: row } = await supabase
    .from('fitbit_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()

  if (!row) return null
  if (new Date(row.expires_at) > new Date()) return row.access_token

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    'refresh_token',
      refresh_token: row.refresh_token,
    }),
  })
  if (!res.ok) {
    // Refresh token is dead (commonly: Google OAuth app still in "Testing" mode,
    // where refresh tokens expire after 7 days). Flag for a reconnect prompt.
    await supabase.from('fitbit_tokens').update({ needs_reconnect: true }).eq('user_id', userId)
    return null
  }

  const data = await res.json()
  await supabase.from('fitbit_tokens').update({
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? row.refresh_token,
    expires_at:    new Date(Date.now() + data.expires_in * 1000).toISOString(),
    needs_reconnect: false,
  }).eq('user_id', userId)
  return data.access_token
}

async function fetchDataPoints(token: string, dataTypeKebab: string, filter?: string, maxPages = 25): Promise<any[]> {
  const points: any[] = []
  let pageToken: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const params = new URLSearchParams({ pageSize: '1000' })
    if (filter) params.set('filter', filter)
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`${HEALTH_BASE}/${dataTypeKebab}/dataPoints?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) break
    const json = await res.json()
    points.push(...(json.dataPoints ?? []))
    pageToken = json.nextPageToken
    if (!pageToken) break
  }
  return points
}

function offsetSeconds(off?: string): number {
  if (!off) return 0
  const m = /(-?\d+)s/.exec(off)
  return m ? parseInt(m[1]) : 0
}
function localDate(iso: string, off?: string): string {
  const t = new Date(iso).getTime() + offsetSeconds(off) * 1000
  return new Date(t).toISOString().split('T')[0]
}
function localMinutes(iso: string, off?: string): number {
  const t = new Date(iso).getTime() + offsetSeconds(off) * 1000
  const d = new Date(t)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}
function dateStr(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}
function avg(arr: number[]): number { return arr.reduce((a, b) => a + b, 0) / arr.length }
function nextDay(d: string): string {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().split('T')[0]
}
function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2
}

const FALLBACK_HEALTH_COLUMNS = new Set([
  'hartslag_rust',
  'hrv_rmssd',
  'slaap_minuten',
  'slaap_score',
  'slaap_diep',
  'slaap_licht',
  'slaap_rem',
])

async function updateThenInsertGezondheid(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  date: string,
  fields: Record<string, unknown>,
) {
  const { data: updated, error: updateError } = await supabase
    .from('gezondheid')
    .update(fields)
    .eq('user_id', userId)
    .eq('datum', date)
    .select('datum')

  if (updateError) return { ok: false as const, error: updateError.message }
  if (updated?.length) return { ok: true as const, inserted: false as const }

  const { error: insertError } = await supabase
    .from('gezondheid')
    .insert({ ...fields, datum: date, user_id: userId })

  if (insertError) return { ok: false as const, error: insertError.message }
  return { ok: true as const, inserted: true as const }
}

export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const token = await getValidToken(supabase, user.id)
  if (!token) return NextResponse.json({ error: 'not connected' }, { status: 404 })

  const cutoff     = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const cutoffIso  = cutoff.toISOString()
  const cutoffDate = cutoffIso.split('T')[0]

  const [sleepPoints, rhrPoints, hrvPoints, spo2Points, respPoints, stepPoints, weightPoints] = await Promise.all([
    fetchDataPoints(token, 'sleep',                   `sleep.interval.end_time >= "${cutoffIso}"`),
    fetchDataPoints(token, 'daily-resting-heart-rate'),
    fetchDataPoints(token, 'heart-rate-variability',  `heart_rate_variability.sample_time.physical_time >= "${cutoffIso}"`),
    fetchDataPoints(token, 'oxygen-saturation',       `oxygen_saturation.sample_time.physical_time >= "${cutoffIso}"`),
    fetchDataPoints(token, 'daily-respiratory-rate'),
    fetchDataPoints(token, 'steps', undefined, 10),
    fetchDataPoints(token, 'weight',                  `weight.sample_time.physical_time >= "${cutoffIso}"`),
  ])

  const rows: Record<string, Record<string, unknown>> = {}
  const ensure = (date: string) => (rows[date] ??= { datum: date })

  const sleepBest: Record<string, number> = {}
  for (const p of sleepPoints) {
    const s = p.sleep
    if (!s?.summary || !s.interval?.endTime) continue
    const date   = localDate(s.interval.endTime, s.interval.endUtcOffset)
    const asleep = parseInt(s.summary.minutesAsleep ?? '0')
    if (sleepBest[date] !== undefined && asleep <= sleepBest[date]) continue
    sleepBest[date] = asleep
    const stages: Record<string, number> = {}
    let awakeCount: number | null = null
    for (const st of s.summary.stagesSummary ?? []) {
      stages[st.type] = parseInt(st.minutes ?? '0')
      if (st.type === 'AWAKE') awakeCount = parseInt(st.count ?? '0') || null
    }
    const awake  = parseInt(s.summary.minutesAwake ?? '0')
    const deepMin = stages.DEEP ?? 0, remMin = stages.REM ?? 0
    const hasStages        = deepMin + remMin > 0
    const durationScore    = Math.min(asleep / 480, 1) ** 2
    const compositionScore = hasStages ? Math.min((deepMin + remMin) / asleep / 0.55, 1) : null
    const efficiencyScore  = asleep + awake > 0 ? Math.max(0, Math.min((asleep / (asleep + awake) - 0.75) / 0.25, 1)) : 0
    const parts: [number, number][] = hasStages
      ? [[durationScore, 0.50], [compositionScore!, 0.35], [efficiencyScore, 0.15]]
      : [[durationScore, 0.80], [efficiencyScore, 0.20]]
    if (awakeCount != null) {
      if (hasStages) { parts[0][1] = 0.45; parts[1][1] = 0.30; parts[2][1] = 0.10 }
      else           { parts[0][1] = 0.70; parts[1][1] = 0.15 }
      parts.push([Math.max(0, Math.min(1 - (awakeCount - 1) / 12, 1)), 0.15])
    }
    const totalW = parts.reduce((a, [, w]) => a + w, 0)
    const sleepScore = asleep > 0 ? Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / totalW * 100) : null
    Object.assign(ensure(date), {
      slaap_minuten: asleep, wakker_minuten: awake, wakker_count: awakeCount,
      slaap_diep: deepMin, slaap_licht: stages.LIGHT ?? 0, slaap_rem: remMin, slaap_score: sleepScore,
      slaap_start_min: localMinutes(s.interval.startTime, s.interval.startUtcOffset),
      slaap_einde_min: localMinutes(s.interval.endTime, s.interval.endUtcOffset),
    })
  }

  for (const p of rhrPoints) {
    const r = p.dailyRestingHeartRate
    if (!r?.date) continue
    const date = dateStr(r.date)
    if (date < cutoffDate) continue
    ensure(date).hartslag_rust = parseInt(r.beatsPerMinute ?? '0') || null
  }

  const hrvAgg: Record<string, number[]> = {}
  for (const p of hrvPoints) {
    const h = p.heartRateVariability
    const v = h?.rootMeanSquareOfSuccessiveDifferencesMilliseconds
    if (typeof v !== 'number') continue
    const physTime = h.sampleTime?.physicalTime, utcOff = h.sampleTime?.utcOffset
    const min = physTime ? localMinutes(physTime, utcOff) : -1
    if (min >= 10 * 60 && min < 22 * 60) continue
    const rawDate = h.sampleTime?.civilTime?.date ? dateStr(h.sampleTime.civilTime.date) : physTime ? localDate(physTime, utcOff) : null
    if (!rawDate) continue
    // HRV samples after 22:00 belong to next day (sleep period extends into next calendar day)
    const date = min >= 22 * 60 ? nextDay(rawDate) : rawDate
    ;(hrvAgg[date] ??= []).push(v)
  }
  for (const [date, vals] of Object.entries(hrvAgg)) {
    ensure(date).hrv_rmssd = Math.round(median(vals) * 10) / 10
  }

  const spo2Agg: Record<string, number[]> = {}
  for (const p of spo2Points) {
    const o = p.oxygenSaturation, v = o?.percentage
    if (typeof v !== 'number' || v < 70 || v > 100) continue
    const physTime2 = o.sampleTime?.physicalTime, utcOff2 = o.sampleTime?.utcOffset
    const min2 = physTime2 ? localMinutes(physTime2, utcOff2) : -1
    const rawDate = o.sampleTime?.civilTime?.date ? dateStr(o.sampleTime.civilTime.date) : physTime2 ? localDate(physTime2, utcOff2) : null
    if (!rawDate) continue
    // SpO2 samples after 22:00 belong to next day (sleep period extends into next calendar day)
    const date = min2 >= 22 * 60 ? nextDay(rawDate) : rawDate
    ;(spo2Agg[date] ??= []).push(v)
  }
  for (const [date, vals] of Object.entries(spo2Agg)) {
    ensure(date).spo2 = Math.round(avg(vals) * 10) / 10
  }

  for (const p of respPoints) {
    const r = p.dailyRespiratoryRate
    if (!r?.date || typeof r.breathsPerMinute !== 'number') continue
    const date = dateStr(r.date)
    if (date < cutoffDate) continue
    ensure(date).ademhalingsfrequentie = Math.round(r.breathsPerMinute * 10) / 10
  }

  for (const p of weightPoints) {
    const w = p.weight
    if (!w) continue
    const kg = w.weightKilograms ?? w.weight?.kilograms
    if (typeof kg !== 'number' || kg < 20 || kg > 300) continue
    let date: string | null = null
    if (w.date) {
      date = dateStr(w.date)
    } else if (w.sampleTime?.physicalTime) {
      date = localDate(w.sampleTime.physicalTime, w.sampleTime.utcOffset)
    }
    if (!date || date < cutoffDate) continue
    const rounded = Math.round(kg * 10) / 10
    // Only set if not already set this date (Hevy wins via DB trigger)
    if (ensure(date).gewicht == null) ensure(date).gewicht = rounded
  }

  // Steps counted separately — never mixed into health rows
  const stepsAgg: Record<string, number> = {}
  for (const p of stepPoints) {
    const st = p.steps
    if (!st?.interval) continue
    const date = st.interval.civilEndTime?.date ? dateStr(st.interval.civilEndTime.date) : localDate(st.interval.endTime, st.interval.endUtcOffset)
    stepsAgg[date] = (stepsAgg[date] ?? 0) + (parseInt(st.count ?? '0') || 0)
  }

  const errors: string[] = []

  // ── Health metrics: UPDATE existing rows (never touches stappen) ────────────
  let healthSynced = 0
  for (const [date, row] of Object.entries(rows)) {
    if (date < cutoffDate) continue
    const fields = Object.fromEntries(
      Object.entries(row).filter(([k, v]) => k !== 'datum' && v != null)
    )
    if (Object.keys(fields).length === 0) continue

    const write = await updateThenInsertGezondheid(supabase, user.id, date, fields)
    if (write.ok) {
      healthSynced++
      continue
    }

    const fallbackFields = Object.fromEntries(
      Object.entries(fields).filter(([key]) => FALLBACK_HEALTH_COLUMNS.has(key))
    )

    if (Object.keys(fallbackFields).length > 0) {
      const fallbackWrite = await updateThenInsertGezondheid(supabase, user.id, date, fallbackFields)
      if (fallbackWrite.ok) {
        healthSynced++
        errors.push(`warn ${date}: saved partial row after schema mismatch`)
        continue
      }
      errors.push(`health ${date}: ${fallbackWrite.error}`)
      continue
    }

    errors.push(`health ${date}: ${write.error}`)
  }

  // ── Steps: only write if Fitbit value is higher than what's stored ──────────
  let stepsSynced = 0
  for (const [date, total] of Object.entries(stepsAgg)) {
    if (date < cutoffDate || total === 0) continue

    // Update only when existing stappen is NULL or lower than what Fitbit reports
    const { data: updated, error: updateError } = await supabase
      .from('gezondheid')
      .update({ stappen: total })
      .eq('user_id', user.id)
      .eq('datum', date)
      .or(`stappen.is.null,stappen.lt.${total}`)
      .select('datum')

    if (updateError) { errors.push(`steps ${date}: ${updateError.message}`); continue }

    if (!updated?.length) {
      // Row doesn't exist yet — insert fresh
      const { data: existing } = await supabase
        .from('gezondheid').select('datum').eq('user_id', user.id).eq('datum', date).maybeSingle()
      if (!existing) {
        const { error: insertError } = await supabase
          .from('gezondheid').insert({ stappen: total, datum: date, user_id: user.id })
        if (insertError) { errors.push(`steps ${date}: ${insertError.message}`); continue }
      }
      // If row exists but stappen was already higher: skip (no-op is correct)
    }
    stepsSynced++
  }

  await supabase.from('fitbit_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', user.id)

  const processedRows = Object.fromEntries(Object.entries(rows).filter(([d]) => d >= cutoffDate))
  return NextResponse.json({ ok: true, healthSynced, stepsSynced, errors, dates: Object.keys(rows).filter(d => d >= cutoffDate).sort(), processedRows })
}
