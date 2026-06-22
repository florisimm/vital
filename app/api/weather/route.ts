import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const CACHE_TTL_MS = 30 * 60 * 1000

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient()

  // 1. Return cached data if fresh (< 30 min)
  const { data: cached } = await supabase
    .from('weather_cache')
    .select('temp, night_temp_c, city, fetched_at')
    .eq('id', 'current')
    .single()

  if (cached?.fetched_at && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return NextResponse.json({
      temp_c:       cached.temp       ?? null,
      night_temp_c: cached.night_temp_c ?? null,
      city:         cached.city        ?? null,
    })
  }

  // 2. Fetch from external APIs
  try {
    const forwarded = req.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : ''

    const geoRes = await fetch(`https://ipwho.is/${ip}`, {
      signal: AbortSignal.timeout(4000),
      headers: { Accept: 'application/json' },
    })
    const geo = await geoRes.json()

    if (!geo.success || !geo.latitude) {
      return NextResponse.json({ temp_c: null, night_temp_c: null, city: null })
    }

    const { latitude, longitude, city } = geo

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m&past_days=1&forecast_days=0&timezone=auto`,
      { signal: AbortSignal.timeout(5000) },
    )
    const weather = await weatherRes.json()

    const temps: number[] = weather.hourly?.temperature_2m ?? []
    const hours: string[] = weather.hourly?.time ?? []

    const nightTemps = temps.filter((_, i) => {
      const h = new Date(hours[i]).getHours()
      return h >= 22 || h <= 6
    })

    const temp_c       = temps.length       > 0 ? temps[temps.length - 1]  : null
    const night_temp_c = nightTemps.length  > 0 ? Math.max(...nightTemps)  : null
    const cityStr      = (city as string)   ?? null

    // 3. Persist to cache (non-blocking)
    supabase.from('weather_cache').upsert(
      { id: 'current', temp: temp_c, night_temp_c, city: cityStr, fetched_at: new Date().toISOString() },
      { onConflict: 'id' },
    )

    return NextResponse.json({ temp_c, night_temp_c, city: cityStr })
  } catch {
    // Serve stale cache rather than failing
    if (cached) {
      return NextResponse.json({
        temp_c:       cached.temp        ?? null,
        night_temp_c: cached.night_temp_c ?? null,
        city:         cached.city         ?? null,
      })
    }
    return NextResponse.json({ temp_c: null, night_temp_c: null, city: null })
  }
}
