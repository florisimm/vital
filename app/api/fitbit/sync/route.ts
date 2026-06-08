import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// ─── OAuth token (Google Health API uses Google OAuth) ──────────────────────────
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
      client_id: process.env.FITBIT_CLIENT_ID!,
      client_secret: process.env.FITBIT_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }),
  })
  if (!res.ok) return null

  const data = await res.json()
  await supabase.from('fitbit_tokens').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? row.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq('user_id', userId)
  return data.access_token
}

// ─── Google Health API fetch (paginated, stops at cutoff date) ──────────────────
const HEALTH_BASE = 'https://health.googleapis.com/v4/users/me/dataTypes'

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

// ─── Date / time helpers ────────────────────────────────────────────────────────
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
function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}
function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2
}

export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const token = await getValidToken(supabase, user.id)
  if (!token) return NextResponse.json({ error: 'not connected' }, { status: 404 })

  // 8-day window
  const cutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
  const cutoffIso = cutoff.toISOString()
  const cutoffDate = cutoffIso.split('T')[0]

  const [sleepPoints, rhrPoints, hrvPoints, spo2Points, respPoints, stepPoints] = await Promise.all([
    fetchDataPoints(token, 'sleep',                   `sleep.interval.end_time >= "${cutoffIso}"`),
    fetchDataPoints(token, 'daily-resting-heart-rate'),                                  // sparse daily, filter in code
    fetchDataPoints(token, 'heart-rate-variability',  `heart_rate_variability.sample_time.physical_time >= "${cutoffIso}"`),
    fetchDataPoints(token, 'oxygen-saturation',       `oxygen_saturation.sample_time.physical_time >= "${cutoffIso}"`),
    fetchDataPoints(token, 'daily-respiratory-rate'),                                    // sparse daily, filter in code
    fetchDataPoints(token, 'steps', undefined, 10),                                       // steps has no interval filter — paginate + filter in code
  ])

  const rows: Record<string, Record<string, unknown>> = {}
  const ensure = (date: string) => (rows[date] ??= { datum: date })

  // ── Sleep: pick the longest sleep period per date (main sleep, not naps) ──
  const sleepBest: Record<string, number> = {}
  for (const p of sleepPoints) {
    const s = p.sleep
    if (!s?.summary || !s.interval?.endTime) continue
    const date = localDate(s.interval.endTime, s.interval.endUtcOffset)
    const asleep = parseInt(s.summary.minutesAsleep ?? '0')
    if (sleepBest[date] !== undefined && asleep <= sleepBest[date]) continue
    sleepBest[date] = asleep

    const stages: Record<string, number> = {}
    let awakeCount: number | null = null
    for (const st of s.summary.stagesSummary ?? []) {
      stages[st.type] = parseInt(st.minutes ?? '0')
      if (st.type === 'AWAKE') awakeCount = parseInt(st.count ?? '0') || null
    }
    const awake = parseInt(s.summary.minutesAwake ?? '0')
    const deepMin = stages.DEEP ?? 0
    const remMin  = stages.REM ?? 0

    // Composite sleep score (0–100), calibrated to approximate Fitbit (which also
    // uses sleeping HR we can't access): duration (convex), deep+REM composition
    // (55% target), efficiency (75–100%), and restlessness (awakenings count).
    const durationScore    = Math.min(asleep / 480, 1) ** 2
    const compositionScore = asleep > 0 ? Math.min((deepMin + remMin) / asleep / 0.55, 1) : 0
    const efficiencyScore  = asleep + awake > 0 ? Math.max(0, Math.min((asleep / (asleep + awake) - 0.75) / 0.25, 1)) : 0
    const parts: [number, number][] = [[durationScore, 0.5], [compositionScore, 0.35], [efficiencyScore, 0.15]]
    if (awakeCount != null) {
      const restlessness = Math.max(0, Math.min(1 - (awakeCount - 1) / 12, 1))
      parts[0][1] = 0.45; parts[1][1] = 0.30; parts[2][1] = 0.10
      parts.push([restlessness, 0.15])
    }
    const totalW = parts.reduce((a, [, w]) => a + w, 0)
    const sleepScore = asleep > 0
      ? Math.round((parts.reduce((a, [v, w]) => a + v * w, 0) / totalW) * 100)
      : null

    Object.assign(ensure(date), {
      slaap_minuten:   asleep,
      wakker_minuten:  awake,
      wakker_count:    awakeCount,
      slaap_diep:      deepMin,
      slaap_licht:     stages.LIGHT ?? 0,
      slaap_rem:       remMin,
      slaap_score:     sleepScore,
      slaap_start_min: localMinutes(s.interval.startTime, s.interval.startUtcOffset),
      slaap_einde_min: localMinutes(s.interval.endTime, s.interval.endUtcOffset),
    })
  }

  // ── Resting heart rate (daily) ──
  for (const p of rhrPoints) {
    const r = p.dailyRestingHeartRate
    if (!r?.date) continue
    const date = dateStr(r.date)
    if (date < cutoffDate) continue
    ensure(date).hartslag_rust = parseInt(r.beatsPerMinute ?? '0') || null
  }

  // ── HRV (intraday RMSSD → nightly median, sleep hours only) ──
  // Filter to 22:00–10:00 local time so all-day wearers don't have daytime
  // activity samples pollute the nightly readout. Night-only wearers are unaffected.
  const hrvAgg: Record<string, number[]> = {}
  for (const p of hrvPoints) {
    const h = p.heartRateVariability
    const v = h?.rootMeanSquareOfSuccessiveDifferencesMilliseconds
    if (typeof v !== 'number') continue
    const physTime = h.sampleTime?.physicalTime
    const utcOff   = h.sampleTime?.utcOffset
    if (physTime) {
      const min = localMinutes(physTime, utcOff)
      if (min >= 10 * 60 && min < 22 * 60) continue  // skip 10:00–22:00
    }
    const date = h.sampleTime?.civilTime?.date ? dateStr(h.sampleTime.civilTime.date) : localDate(physTime ?? '', utcOff)
    ;(hrvAgg[date] ??= []).push(v)
  }
  for (const [date, vals] of Object.entries(hrvAgg)) {
    ensure(date).hrv_rmssd = Math.round(median(vals) * 10) / 10
  }

  // ── SpO2 (intraday %, filter sensor errors, nightly average) ──
  const spo2Agg: Record<string, number[]> = {}
  for (const p of spo2Points) {
    const o = p.oxygenSaturation
    const v = o?.percentage
    if (typeof v !== 'number' || v < 70 || v > 100) continue
    const date = o.sampleTime?.civilTime?.date ? dateStr(o.sampleTime.civilTime.date) : localDate(o.sampleTime.physicalTime, o.sampleTime.utcOffset)
    ;(spo2Agg[date] ??= []).push(v)
  }
  for (const [date, vals] of Object.entries(spo2Agg)) {
    ensure(date).spo2 = Math.round(avg(vals) * 10) / 10
  }

  // ── Respiratory rate (daily) ──
  for (const p of respPoints) {
    const r = p.dailyRespiratoryRate
    if (!r?.date || typeof r.breathsPerMinute !== 'number') continue
    const date = dateStr(r.date)
    if (date < cutoffDate) continue
    ensure(date).ademhalingsfrequentie = Math.round(r.breathsPerMinute * 10) / 10
  }

  // ── Steps (HealthKit intervals → daily sum) ──
  const stepsAgg: Record<string, number> = {}
  for (const p of stepPoints) {
    const st = p.steps
    if (!st?.interval) continue
    const date = st.interval.civilEndTime?.date ? dateStr(st.interval.civilEndTime.date) : localDate(st.interval.endTime, st.interval.endUtcOffset)
    stepsAgg[date] = (stepsAgg[date] ?? 0) + (parseInt(st.count ?? '0') || 0)
  }
  for (const [date, total] of Object.entries(stepsAgg)) {
    if (date < cutoffDate) continue
    ensure(date).stappen = total
  }

  const upsertRows = Object.values(rows)
    .filter(r => (r.datum as string) >= cutoffDate)
    // Strip null/undefined so an upsert never overwrites existing data with blanks.
    // Per-row upsert: ON CONFLICT updates only the provided columns, preserving the rest.
    .map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)) as Record<string, unknown>)
    .filter(r => Object.keys(r).length > 1) // keep rows that have data beyond just `datum`

  for (const row of upsertRows) {
    await supabase.from('gezondheid').upsert({ ...row, user_id: user.id }, { onConflict: 'user_id,datum' })
  }

  const syncedDates = upsertRows.map(r => r.datum as string).sort()

  await supabase.from('fitbit_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true, synced: upsertRows.length, dates: syncedDates })
}
