import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { rateLimit, readJsonLimited, rejectCrossOrigin } from '@/lib/server-security'

const ALLOWED_PROFILES = new Set(['foot-walking', 'cycling-regular', 'cycling-road', 'cycling-mountain'])

type RouteRequest = {
  profile?: unknown
  body?: {
    coordinates?: unknown
    options?: {
      round_trip?: { length?: unknown; points?: unknown; seed?: unknown }
      profile_params?: unknown
    }
  }
}

function validCoordinate(coord: unknown): coord is [number, number] {
  if (!Array.isArray(coord) || coord.length !== 2) return false
  const [lon, lat] = coord
  return typeof lon === 'number' && typeof lat === 'number'
    && Number.isFinite(lon) && Number.isFinite(lat)
    && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
}

function validRouteBody(body: RouteRequest['body']) {
  const coordinates = body?.coordinates
  if (!Array.isArray(coordinates) || (coordinates.length !== 1 && coordinates.length !== 2)) return false
  if (!coordinates.every(validCoordinate)) return false

  const roundTrip = body?.options?.round_trip
  if (!roundTrip) return coordinates.length === 2

  const { length, points, seed } = roundTrip
  return coordinates.length === 1
    && typeof length === 'number' && Number.isFinite(length) && length >= 500 && length <= 100_000
    && typeof points === 'number' && points >= 2 && points <= 5
    && typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 99_999
}

export async function POST(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req)
  if (crossOrigin) return crossOrigin

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = rateLimit(`route-plan:${user.id}`, 30, 60_000)
  if (limited) return limited

  const apiKey = process.env.ORS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Route service unavailable' }, { status: 500 })

  const payload = await readJsonLimited<RouteRequest>(req, 32_000)
  const profile = typeof payload?.profile === 'string' ? payload.profile : ''
  const body = payload?.body
  if (!ALLOWED_PROFILES.has(profile) || !validRouteBody(body)) {
    return NextResponse.json({ error: 'Invalid route request' }, { status: 400 })
  }

  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': apiKey },
      body: JSON.stringify(body),
    }
  )

  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: 'Route service unavailable' }, { status: 502 })
  return NextResponse.json(data)
}
