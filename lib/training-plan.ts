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

// Dutch + English keywords for aerobic/Zone 2 effort (positive signal)
const Z2_KEYWORDS = [
  'easy', 'zone 2', 'zone2', 'z2', 'endurance', 'aerobic', 'base', 'recovery',
  'duurloop', 'rustig', 'rustige', 'lsd', 'lange duur', 'duur', 'herstel',
  'aerobe', 'basisuithouding', 'ontspannen', 'long run', 'long ride', 'lange rit',
  'slow', 'conversational', 'foundation',
]

// Dutch + English keywords for quality/high-intensity effort
const QUALITY_KEYWORDS = [
  'interval', 'intervals', 'tempo', 'ftp', 'speed', 'vo2', 'threshold', 'drempel',
  'race', 'wedstrijd', 'koers', 'tijdrit', 'time trial',
  'repeat', 'repeats', 'sprint', 'strides', 'surge', 'progressie', 'progression',
  'lactate', 'lactaat', 'anaerob', 'sweetspot', 'sweet spot', 'above threshold',
  '4x', '5x', '6x', '8x', '10x', '12x', 'wvo2', 'watt', 'tt ',
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

// Derive avg session duration from real history; falls back to sport-specific defaults.
function historicalAvgSessionMin(activities: any[], sport: string): number {
  const DEFAULTS: Record<string, number> = { running: 50, cycling: 75, swimming: 45, gym: 60 }
  const sportActs = activities
    .filter(a => matchesSport(a.sport_type ?? '', sport) && (a.moving_time ?? 0) > 600)
  if (sportActs.length === 0) return DEFAULTS[sport] ?? 50
  const total = sportActs.reduce((s: number, a: any) => s + (a.moving_time as number), 0)
  return Math.round(total / sportActs.length / 60)
}

export function suggestZoneTargets(sport: string, freq: number, activities?: any[]): ZoneTargets {
  if (freq === 0) return { z2Minutes: 0, qualityMinutes: 0 }

  const avgMin    = historicalAvgSessionMin(activities ?? [], sport)
  const totalMin  = freq * avgMin

  // Polarized model: 80% aerobic base, 20% quality — rounded to nearest 5 min
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

function classifyActivity(a: any, estimatedMaxHR: number, zones?: Zones): 'z2' | 'quality' | 'moderate' {
  const name = (a.name ?? '').toLowerCase()

  // 1. Keyword override — highest confidence
  if (Z2_KEYWORDS.some(kw => name.includes(kw))) return 'z2'
  if (QUALITY_KEYWORDS.some(kw => name.includes(kw))) return 'quality'

  // 2. HR-based classification
  if (a.average_heartrate) {
    const r = (a.average_heartrate as number) / estimatedMaxHR
    if (r <= 0.75) return 'z2'
    if (r >= 0.82) return 'quality'
    return 'moderate' // 75-82% = grey zone, handled by caller
  }

  // 3. Speed-based fallback (if zone calibration available)
  if (zones?.z2Speed && a.average_speed) {
    return (a.average_speed as number) <= (zones.z2Speed * 1.08) ? 'z2' : 'quality'
  }

  // 4. Default to Zone 2 when nothing else tells us (unknown intensity = likely easy)
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

    const zone = classifyActivity(a, estimated, zones)
    // 'moderate' (75-82% HR) counts toward quality in the polarized model
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
