import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const CACHE_TTL_MS = 30 * 60 * 1000

type HourlyEntry = { hour: string; temp: number }

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient()

  // 1. Return cached data if fresh (< 30 min)
  const { data: cached } = await supabase
    .from('weather_cache')
    .select('temp, night_temp_c, city, fetched_at, hourly_forecast')
    .eq('id', 'current')
    .single()

  if (cached?.fetched_at && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return NextResponse.json({
      temp_c:           cached.temp             ?? null,
      night_temp_c:     cached.night_temp_c     ?? null,
      city:             cached.city             ?? null,
      hourly_forecast:  cached.hourly_forecast  ?? null,
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
      return NextResponse.json({ temp_c: null, night_temp_c: null, city: null, hourly_forecast: null })
    }

    const { latitude, longitude, city } = geo

    // forecast_days=2 to cover tonight's hours past midnight
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m&forecast_days=2&timezone=auto`,
      { signal: AbortSignal.timeout(5000) },
    )
    const weather = await weatherRes.json()

    const temps: number[] = weather.hourly?.temperature_2m ?? []
    const hours: string[] = weather.hourly?.time ?? []

    const now = new Date()
    const currentHour = now.getHours()

    // Today remaining hours: from current hour up to and including 23:00 today
    const todayStr = now.toISOString().slice(0, 10)
    const hourly_forecast: HourlyEntry[] = []
    for (let i = 0; i < hours.length; i++) {
      const date = hours[i].slice(0, 10)
      const h = new Date(hours[i]).getHours()
      if (date === todayStr && h >= currentHour && h <= 23) {
        hourly_forecast.push({ hour: `${String(h).padStart(2, '0')}:00`, temp: Math.round(temps[i]) })
      }
    }

    const nightTemps = temps.filter((_, i) => {
      const h = new Date(hours[i]).getHours()
      return h >= 22 || h <= 6
    })

    const temp_c       = hourly_forecast[0]?.temp ?? (temps.length > 0 ? Math.round(temps[temps.length - 1]) : null)
    const night_temp_c = nightTemps.length > 0 ? Math.max(...nightTemps) : null
    const cityStr      = (city as string) ?? null

    // 3. Persist to cache (non-blocking)
    supabase.from('weather_cache').upsert(
      { id: 'current', temp: temp_c, night_temp_c, city: cityStr, hourly_forecast, fetched_at: new Date().toISOString() },
      { onConflict: 'id' },
    )

    return NextResponse.json({ temp_c, night_temp_c, city: cityStr, hourly_forecast })
  } catch {
    // Serve stale cache rather than failing
    if (cached) {
      return NextResponse.json({
        temp_c:           cached.temp             ?? null,
        night_temp_c:     cached.night_temp_c     ?? null,
        city:             cached.city             ?? null,
        hourly_forecast:  cached.hourly_forecast  ?? null,
      })
    }
    return NextResponse.json({ temp_c: null, night_temp_c: null, city: null, hourly_forecast: null })
  }
}
