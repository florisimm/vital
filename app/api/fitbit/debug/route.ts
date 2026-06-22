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
  if (!res.ok) return null
  const data = await res.json()
  await supabase.from('fitbit_tokens').update({
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? row.refresh_token,
    expires_at:    new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq('user_id', userId)
  return data.access_token
}

async function probeEndpoint(token: string, dataType: string, filter?: string) {
  const params = new URLSearchParams({ pageSize: '5' })
  if (filter) params.set('filter', filter)
  const url = `${HEALTH_BASE}/${dataType}/dataPoints?${params}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const body = await res.text()
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { parsed = body }
  return { status: res.status, url, body: parsed }
}

export async function GET(_req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const token = await getValidToken(supabase, user.id)
  if (!token) return NextResponse.json({ error: 'no token — not connected' }, { status: 404 })

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [sleep, rhr, hrv, spo2, resp, steps] = await Promise.all([
    probeEndpoint(token, 'sleep',                   `sleep.interval.end_time >= "${cutoff}"`),
    probeEndpoint(token, 'daily-resting-heart-rate'),
    probeEndpoint(token, 'heart-rate-variability',  `heart_rate_variability.sample_time.physical_time >= "${cutoff}"`),
    probeEndpoint(token, 'oxygen-saturation',       `oxygen_saturation.sample_time.physical_time >= "${cutoff}"`),
    probeEndpoint(token, 'daily-respiratory-rate'),
    probeEndpoint(token, 'steps'),
  ])

  const { data: dbRows } = await supabase
    .from('gezondheid')
    .select('datum,slaap_minuten,hartslag_rust,hrv_rmssd,spo2,stappen')
    .eq('user_id', user.id)
    .order('datum', { ascending: false })
    .limit(7)

  return NextResponse.json({
    token_ok: true,
    endpoints: { sleep, rhr, hrv, spo2, resp, steps },
    db_rows: dbRows ?? [],
  })
}
