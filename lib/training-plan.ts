export type Zones = {
  z2Speed: number | null
  thresholdSpeed: number | null
  longDist: number | null
}

export type ZoneTargets = {
  z2Minutes: number
  qualityMinutes: number
  updatedWeek?: number
  updatedYear?: number
}

export type ZoneProgress = {
  z2Minutes: number
  qualityMinutes: number
}

// All Strava sport_type values, normalized (lowercase, underscores stripped)
const SPORT_TYPES: Record<string, string[]> = {
  running:  ['run', 'virtualrun', 'trailrun', 'treadmill', 'track', 'ultrarun'],
  cycling:  ['ride', 'virtualride', 'ebikeride', 'gravelride', 'mountainbikeride', 'handcycle', 'velomobile', 'cycling'],
  swimming: ['swim', 'openwaterswim', 'poolswim'],
  gym:      ['weighttraining', 'workout', 'crossfit', 'elliptical', 'stairstepper', 'yoga', 'pilates', 'rowing', 'highintensityintervaltraining', 'coreandflexibility', 'hiit'],
}

// Shared Zone 2 keywords (all sports)
const Z2_KEYWORDS = [
  'easy', 'zone 2', 'zone2', 'z2', 'endurance', 'aerobic', 'base', 'recovery',
  'duurloop', 'rustig', 'rustige', 'lsd', 'lange duur', 'duur', 'herstel',
  'aerobe', 'basisuithouding', 'ontspannen', 'long run', 'long ride', 'lange rit',
  'slow', 'conversational', 'foundation', 'technique', 'techniek', 'drill',
]

// Shared quality/high-intensity keywords (all sports)
const QUALITY_KEYWORDS = [
  'interval', 'intervals', 'tempo', 'ftp', 'speed', 'vo2', 'threshold', 'drempel',
  'race', 'wedstrijd', 'koers', 'tijdrit', 'time trial',
  'repeat', 'repeats', 'sprint', 'strides', 'surge', 'progressie', 'progression',
  'lactate', 'lactaat', 'anaerob', 'sweetspot', 'sweet spot', 'above threshold',
  '4x', '5x', '6x', '8x', '10x', '12x', 'vo2max', 'tt ',
  // Cycling-specific
  'sst', 'criterium', 'crit', 'ramp test', 'ftp test', '20min',
  // Running-specific
  'fartlek', 'parkrun', 'drempeltraining', 'snelheidswerk',
  // Swimming-specific
  'sprint set', 'race pace', 'maximal',
]

function normalizeSport(s: string): string {
  return s.toLowerCase().replace(/[_ ]/g, '')
}

function matchesSport(sportType: string, sport: string): boolean {
  const norm = normalizeSport(sportType)
  return (SPORT_TYPES[sport] ?? []).includes(norm)
}

// Use the 95th-percentile average HR divided by a conservative factor to estimate maxHR.
// This is more robust than using the single highest value (which may be an anomaly).
function estimateMaxHR(activities: any[], provided?: number): number {
  if (provided) return provided
  const hrs = activities
    .map(a => a.average_heartrate as number)
    .filter(Boolean)
    .sort((a, b) => a - b)
  if (hrs.length === 0) return 190
  // Hard steady efforts land ~88% of maxHR; we sample the 95th percentile to stay robust
  const idx = Math.min(Math.floor(hrs.length * 0.95), hrs.length - 1)
  return Math.round(hrs[idx] / 0.88)
}

export function computeZones(activities: any[], sport: string, maxHR?: number): Zones {
  const sportActs = activities.filter(a => matchesSport(a.sport_type ?? '', sport))
  const withHR    = sportActs.filter(a => a.average_heartrate && a.average_speed)
  const longestDist = sportActs.length > 0 ? Math.max(...sportActs.map(a => a.distance ?? 0)) : 0

  if (withHR.length < 3) {
    return { z2Speed: null, thresholdSpeed: null, longDist: longestDist > 0 ? longestDist : null }
  }

  const estimated = estimateMaxHR(withHR, maxHR)
  const avg = (arr: typeof withHR) =>
    arr.length ? arr.reduce((s, a) => s + (a.average_speed as number), 0) / arr.length : null

  // Zone 2: 60-75% maxHR (aerobic base)
  const z2Acts  = withHR.filter(a => {
    const r = (a.average_heartrate as number) / estimated
    return r >= 0.60 && r <= 0.75
  })
  // Threshold / Zone 4: 83-92% maxHR
  const thrActs = withHR.filter(a => {
    const r = (a.average_heartrate as number) / estimated
    return r >= 0.83 && r <= 0.95
  })

  return {
    z2Speed:        avg(z2Acts),
    thresholdSpeed: avg(thrActs),
    longDist:       longestDist > 0 ? longestDist : null,
  }
}

// hoursPerWeek is the user's weekly hour target for this sport (e.g. 5 = 5h/week).
// Splits 80/20 into Zone 2 / quality, rounded to nearest 5 min.
export function suggestZoneTargets(sport: string, hoursPerWeek: number): ZoneTargets {
  if (hoursPerWeek === 0) return { z2Minutes: 0, qualityMinutes: 0 }
  const totalMin       = hoursPerWeek * 60
  const z2Minutes      = Math.max(30, Math.round((totalMin * 0.80) / 5) * 5)
  const qualityMinutes = Math.max(15, Math.round((totalMin * 0.20) / 5) * 5)
  return { z2Minutes, qualityMinutes }
}

function getWeekBounds(weekOffset = 0): { start: Date; end: Date } {
  const now       = new Date()
  const diffToMon = now.getDay() === 0 ? -6 : 1 - now.getDay()
  const monday    = new Date(now)
  monday.setDate(now.getDate() + diffToMon)
  monday.setHours(0, 0, 0, 0)

  const start = new Date(monday)
  start.setDate(start.getDate() + weekOffset * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

function classifyCycling(a: any, maxHR: number, durationMin: number): 'z2' | 'quality' {
  // Power variability index: NP/AP > 1.08 signals structured intervals (power spikes)
  if (a.weighted_average_watts && a.average_watts && a.average_watts > 50) {
    const vi = (a.weighted_average_watts as number) / (a.average_watts as number)
    if (vi > 1.08) return 'quality'
  }

  // Long rides (>90 min) are almost never interval sessions
  if (durationMin > 90) {
    if (a.average_heartrate && (a.average_heartrate as number) / maxHR > 0.88) return 'quality'
    return 'z2'
  }

  // HR-based: cycling HR runs ~5 bpm lower than running at same effort → 78% ceiling for Z2
  if (a.average_heartrate) {
    const pct = (a.average_heartrate as number) / maxHR
    if (pct <= 0.78) return 'z2'
    if (pct > 0.86) return 'quality'
    // Grey zone 78–86%: long session → Z2 (sweetspot/tempo), short → quality
    return durationMin >= 60 ? 'z2' : 'quality'
  }

  // Speed signal: avg > 34 km/h on a short ride suggests a hard/race effort
  if (a.average_speed && (a.average_speed as number) * 3.6 > 34 && durationMin < 75) return 'quality'

  return durationMin > 60 ? 'z2' : 'quality'
}

function classifyRunning(a: any, maxHR: number, durationMin: number, distM: number, zones?: Zones): 'z2' | 'quality' {
  const distKm = distM / 1000

  // Long run: >75 min or >12 km is almost always Z2
  // Exception: HR consistently high across the whole effort (e.g. a race)
  if (durationMin > 75 || distKm > 12) {
    if (a.average_heartrate && (a.average_heartrate as number) / maxHR > 0.88) return 'quality'
    return 'z2'
  }

  // HR-based: running HR — 80% ceiling for Z2, >87% clearly quality
  if (a.average_heartrate) {
    const pct = (a.average_heartrate as number) / maxHR
    if (pct <= 0.80) return 'z2'
    if (pct > 0.87) return 'quality'
    // Tempo zone (80–87%): medium session → Z2, short → quality
    return durationMin >= 50 ? 'z2' : 'quality'
  }

  // Pace-based fallback against calibrated Z2 speed
  if (zones?.z2Speed && a.average_speed) {
    return (a.average_speed as number) <= zones.z2Speed * 1.05 ? 'z2' : 'quality'
  }

  // Default: short run without HR = likely quality (intervals, parkrun)
  return durationMin >= 45 ? 'z2' : 'quality'
}

function classifySwimming(a: any, durationMin: number, distM: number): 'z2' | 'quality' {
  // HR is rarely recorded for swimming — lean on distance and duration
  // Long swim (>2500 m or >45 min) = endurance/technique
  if (distM > 2500 || durationMin > 45) return 'z2'
  // Short fast swim = sprint/interval sets
  if (distM > 0 && distM < 1500 && durationMin < 30) return 'quality'
  // Pace signal: < 1.5 m/s (= ~1:07/100m) is fast and signals quality
  if (a.average_speed && (a.average_speed as number) > 1.5 && durationMin < 35) return 'quality'
  return 'z2'
}

function classifyActivity(a: any, estimatedMaxHR: number, zones?: Zones, sport?: string): 'z2' | 'quality' {
  const name = (a.name ?? '').toLowerCase()

  // 1. Keyword override — highest confidence regardless of sport
  if (Z2_KEYWORDS.some(kw => name.includes(kw))) return 'z2'
  if (QUALITY_KEYWORDS.some(kw => name.includes(kw))) return 'quality'

  const durationMin = (a.moving_time ?? 0) / 60
  const distM       = a.distance ?? 0
  const sportStr    = sport ?? ''

  // 2. Sport-specific classifiers
  if (sportStr === 'cycling' || matchesSport(a.sport_type ?? '', 'cycling'))
    return classifyCycling(a, estimatedMaxHR, durationMin)
  if (sportStr === 'running' || matchesSport(a.sport_type ?? '', 'running'))
    return classifyRunning(a, estimatedMaxHR, durationMin, distM, zones)
  if (sportStr === 'swimming' || matchesSport(a.sport_type ?? '', 'swimming'))
    return classifySwimming(a, durationMin, distM)

  // 3. Generic fallback
  if (a.average_heartrate) {
    return (a.average_heartrate as number) / estimatedMaxHR <= 0.82 ? 'z2' : 'quality'
  }
  if (zones?.z2Speed && a.average_speed) {
    return (a.average_speed as number) <= zones.z2Speed * 1.08 ? 'z2' : 'quality'
  }
  return 'z2'
}

export function computeWeekProgress(
  activities: any[],
  sport: string,
  zones?: Zones,
  maxHR?: number,
  weekOffset = 0,
): ZoneProgress {
  const { start, end } = getWeekBounds(weekOffset)

  const weekActs = activities.filter(a => {
    if (!a.start_date) return false
    const d = new Date(a.start_date)
    return d >= start && d < end && matchesSport(a.sport_type ?? '', sport)
  })

  // Estimate maxHR from ALL activities (broader sample = better estimate)
  const estimated = estimateMaxHR(activities.filter(a => a.average_heartrate), maxHR)

  let z2Minutes      = 0
  let qualityMinutes = 0

  for (const a of weekActs) {
    const durationMin = Math.round((a.moving_time ?? 0) / 60)
    if (durationMin < 5) continue

    const zone = classifyActivity(a, estimated, zones, sport)
    if (zone === 'z2') z2Minutes += durationMin
    else qualityMinutes += durationMin
  }

  return { z2Minutes, qualityMinutes }
}

export function applyWeeklyProgression(targets: ZoneTargets, adherencePct: number): ZoneTargets {
  if (adherencePct < 60) return targets
  const factor       = adherencePct >= 90 ? 1.05 : 1.0
  const maxIncrement = 15
  return {
    ...targets,
    z2Minutes:      Math.round(Math.min(targets.z2Minutes * factor,      targets.z2Minutes      + maxIncrement) / 5) * 5,
    qualityMinutes: Math.round(Math.min(targets.qualityMinutes * factor, targets.qualityMinutes + maxIncrement) / 5) * 5,
  }
}

export function getISOWeek(d: Date): number {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}
