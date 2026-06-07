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

  // Refresh via Google OAuth
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

async function fitGet(path: string, token: string) {
  const res = await fetch(`https://www.googleapis.com/fitness/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok ? res.json() : null
}

async function fitAggregate(token: string, dataTypeName: string, startMs: number, endMs: number) {
  const res = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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

export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const token = await getValidToken(supabase, user.id)
  if (!token) return NextResponse.json({ error: 'not connected' }, { status: 404 })

  const endMs = Date.now()
  const startMs = endMs - 7 * 24 * 60 * 60 * 1000

  const [stepsData, heartData, sleepData] = await Promise.all([
    fitAggregate(token, 'com.google.step_count.delta', startMs, endMs),
    fitAggregate(token, 'com.google.heart_rate.bpm', startMs, endMs),
    fitAggregate(token, 'com.google.sleep.segment', startMs, endMs),
  ])

  const rows: Record<string, Record<string, unknown>> = {}

  // Steps per day
  for (const bucket of stepsData?.bucket ?? []) {
    const date = msToDate(parseInt(bucket.startTimeMillis))
    const val = bucket.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal ?? null
    if (val !== null) {
      rows[date] = { ...rows[date], datum: date, stappen: val }
    }
  }

  // Resting HR per day (average of day's readings)
  for (const bucket of heartData?.bucket ?? []) {
    const date = msToDate(parseInt(bucket.startTimeMillis))
    const points = bucket.dataset?.[0]?.point ?? []
    if (points.length > 0) {
      const avg = Math.round(points.reduce((s: number, p: any) => s + (p.value?.[0]?.fpVal ?? 0), 0) / points.length)
      rows[date] = { ...rows[date], datum: date, hartslag_rust: avg }
    }
  }

  // Sleep per day (sum minutes of sleep segments)
  const sleepByDate: Record<string, number> = {}
  for (const bucket of sleepData?.bucket ?? []) {
    for (const point of bucket.dataset?.[0]?.point ?? []) {
      const date = msToDate(parseInt(point.startTimeNanos) / 1_000_000)
      const durationMs = (parseInt(point.endTimeNanos) - parseInt(point.startTimeNanos)) / 1_000_000
      sleepByDate[date] = (sleepByDate[date] ?? 0) + Math.round(durationMs / 60000)
    }
  }
  for (const [date, minutes] of Object.entries(sleepByDate)) {
    rows[date] = { ...rows[date], datum: date, slaap_minuten: minutes }
  }

  const upsertRows = Object.values(rows).map(r => ({ ...r, user_id: user.id }))

  if (upsertRows.length > 0) {
    await supabase.from('gezondheid').upsert(upsertRows, { onConflict: 'user_id,datum' })
  }

  return NextResponse.json({ ok: true, synced: upsertRows.length })
}
