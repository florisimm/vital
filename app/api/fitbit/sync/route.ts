import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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

async function fitAggregate(token: string, dataTypeName: string, startMs: number, endMs: number) {
  const res = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aggregateBy: [{ dataTypeName }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: startMs,
      endTimeMillis: endMs,
    }),
  })
  return res.ok ? res.json() : null
}

function msToDate(ms: number) {
  return new Date(ms).toISOString().split('T')[0]
}

// Sleep segment type codes from Google Fit
const SLEEP_AWAKE = 1
const SLEEP_LIGHT = 4
const SLEEP_DEEP  = 5
const SLEEP_REM   = 6

export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const token = await getValidToken(supabase, user.id)
  if (!token) return NextResponse.json({ error: 'not connected' }, { status: 404 })

  const endMs = Date.now()
  const startMs = endMs - 7 * 24 * 60 * 60 * 1000

  const [stepsData, heartData, sleepData, spo2Data, respData, hrvData] = await Promise.all([
    fitAggregate(token, 'com.google.step_count.delta',          startMs, endMs),
    fitAggregate(token, 'com.google.heart_rate.bpm',            startMs, endMs),
    fitAggregate(token, 'com.google.sleep.segment',             startMs, endMs),
    fitAggregate(token, 'com.google.oxygen_saturation',         startMs, endMs),
    fitAggregate(token, 'com.google.respiratory_rate',          startMs, endMs),
    fitAggregate(token, 'com.google.heart_rate.variability.rmssd.measurement', startMs, endMs),
  ])

  const rows: Record<string, Record<string, unknown>> = {}

  // Steps
  for (const bucket of stepsData?.bucket ?? []) {
    const date = msToDate(parseInt(bucket.startTimeMillis))
    const val = bucket.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal ?? null
    if (val !== null) rows[date] = { ...rows[date], datum: date, stappen: val }
  }

  // Resting HR (min of daily averages — approximation of resting)
  for (const bucket of heartData?.bucket ?? []) {
    const date = msToDate(parseInt(bucket.startTimeMillis))
    const points: any[] = bucket.dataset?.[0]?.point ?? []
    if (points.length > 0) {
      const vals = points.map((p: any) => p.value?.[0]?.fpVal ?? 0).filter(Boolean)
      const resting = vals.length ? Math.round(Math.min(...vals)) : null
      if (resting) rows[date] = { ...rows[date], datum: date, hartslag_rust: resting }
    }
  }

  // Sleep phases from segments
  for (const bucket of sleepData?.bucket ?? []) {
    const date = msToDate(parseInt(bucket.startTimeMillis))
    let awake = 0, light = 0, deep = 0, rem = 0
    let firstStartNs = Infinity, lastEndNs = 0

    for (const point of bucket.dataset?.[0]?.point ?? []) {
      const startNs  = parseInt(point.startTimeNanos)
      const endNs    = parseInt(point.endTimeNanos)
      const durationMin = Math.round((endNs - startNs) / 1_000_000 / 60_000)
      const type = point.value?.[0]?.intVal

      if (startNs < firstStartNs) firstStartNs = startNs
      if (endNs > lastEndNs) lastEndNs = endNs

      if (type === SLEEP_AWAKE) awake += durationMin
      else if (type === SLEEP_LIGHT) light += durationMin
      else if (type === SLEEP_DEEP)  deep  += durationMin
      else if (type === SLEEP_REM)   rem   += durationMin
    }

    const asleep = light + deep + rem
    if (asleep === 0 && awake === 0) continue

    const score = asleep > 0 ? Math.round((asleep / (asleep + awake)) * 100) : null

    // Bedtime + wake time as minutes since midnight UTC
    const slaap_start_min = firstStartNs < Infinity
      ? (() => { const d = new Date(firstStartNs / 1_000_000); return d.getUTCHours() * 60 + d.getUTCMinutes() })()
      : null
    const slaap_einde_min = lastEndNs > 0
      ? (() => { const d = new Date(lastEndNs / 1_000_000); return d.getUTCHours() * 60 + d.getUTCMinutes() })()
      : null

    rows[date] = {
      ...rows[date],
      datum: date,
      slaap_minuten:  asleep,
      wakker_minuten: awake,
      slaap_licht:    light,
      slaap_diep:     deep,
      slaap_rem:      rem,
      slaap_score:    score,
      slaap_start_min,
      slaap_einde_min,
    }
  }

  // SpO2
  for (const bucket of spo2Data?.bucket ?? []) {
    const date = msToDate(parseInt(bucket.startTimeMillis))
    const points: any[] = bucket.dataset?.[0]?.point ?? []
    if (points.length > 0) {
      const avg = points.reduce((s: number, p: any) => s + (p.value?.[0]?.fpVal ?? 0), 0) / points.length
      rows[date] = { ...rows[date], datum: date, spo2: Math.round(avg * 10) / 10 }
    }
  }

  // Respiratory rate
  for (const bucket of respData?.bucket ?? []) {
    const date = msToDate(parseInt(bucket.startTimeMillis))
    const points: any[] = bucket.dataset?.[0]?.point ?? []
    if (points.length > 0) {
      const avg = points.reduce((s: number, p: any) => s + (p.value?.[0]?.fpVal ?? 0), 0) / points.length
      rows[date] = { ...rows[date], datum: date, ademhalingsfrequentie: Math.round(avg * 10) / 10 }
    }
  }

  // HRV
  for (const bucket of hrvData?.bucket ?? []) {
    const date = msToDate(parseInt(bucket.startTimeMillis))
    const points: any[] = bucket.dataset?.[0]?.point ?? []
    if (points.length > 0) {
      const avg = points.reduce((s: number, p: any) => s + (p.value?.[0]?.fpVal ?? 0), 0) / points.length
      rows[date] = { ...rows[date], datum: date, hrv_rmssd: Math.round(avg * 10) / 10 }
    }
  }

  const upsertRows = Object.values(rows).map(r => ({ ...r, user_id: user.id }))

  if (upsertRows.length > 0) {
    await supabase.from('gezondheid').upsert(upsertRows, { onConflict: 'user_id,datum' })
  }

  // Mark last sync time
  await supabase.from('fitbit_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true, synced: upsertRows.length })
}
