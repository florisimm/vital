import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const forwarded = req.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : ''

    // IP geolocation (free, no key)
    const geoRes = await fetch(`https://ipwho.is/${ip}`, {
      signal: AbortSignal.timeout(4000),
      headers: { 'Accept': 'application/json' },
    })
    const geo = await geoRes.json()

    if (!geo.success || !geo.latitude) {
      return NextResponse.json({ temp_c: null, night_temp_c: null, city: null })
    }

    const { latitude, longitude, city } = geo

    // Fetch hourly temps for yesterday + today from Open-Meteo (free, no key)
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m&past_days=1&forecast_days=0&timezone=auto`,
      { signal: AbortSignal.timeout(5000) }
    )
    const weather = await weatherRes.json()

    const temps: number[] = weather.hourly?.temperature_2m ?? []
    const hours: string[] = weather.hourly?.time ?? []

    // Night temps = hours 22–06 of the previous night (warmth affects sleep quality & HRV)
    const nightTemps = temps.filter((_, i) => {
      const h = new Date(hours[i]).getHours()
      return h >= 22 || h <= 6
    })
    const nightTempC = nightTemps.length > 0 ? Math.max(...nightTemps) : null

    // Current temperature = most recent reading
    const currentTempC = temps.length > 0 ? temps[temps.length - 1] : null

    return NextResponse.json({ temp_c: currentTempC, night_temp_c: nightTempC, city: city ?? null })
  } catch {
    return NextResponse.json({ temp_c: null, night_temp_c: null, city: null })
  }
}
