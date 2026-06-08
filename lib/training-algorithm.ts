// ─── Types ────────────────────────────────────────────────────────────────────

export type SportType = 'cycling' | 'running' | 'strength' | 'other'
export type TrainingType = 'herstel' | 'zone2' | 'tempo' | 'interval' | 'lang'
export type UserLevel = 'beginner' | 'intermediate' | 'advanced'

export type Advice = {
  sport: SportType
  trainingType: TrainingType
  userLevel: UserLevel
  durationMin: number
  targetKm: number
  targetPace: string | null   // running: mm:ss/km
  targetSpeed: number | null  // cycling: km/h
  zone: string
  basis: string
}

export type ComputeAdviceResult = {
  advice: Advice
  isPersonalized: boolean   // false → show generic-data banner in UI
  activityCount: number
}

// ─── Sport detection ──────────────────────────────────────────────────────────

export function detectSport(title: string): SportType {
  const t = title.toLowerCase()
  if (['fietsen', 'ride', 'cycling', 'wielren', 'cycl'].some(k => t.includes(k))) return 'cycling'
  if (['hardlopen', 'run', 'loop', 'duurloop', 'interval', 'tempo'].some(k => t.includes(k))) return 'running'
  if (['gym', 'strength', 'push', 'pull', 'squat', 'crossfit'].some(k => t.includes(k))) return 'strength'
  return 'other'
}

// ─── Algorithm helpers ────────────────────────────────────────────────────────

function matchesSport(a: any, sport: SportType): boolean {
  const s = (a.sport_type ?? '').toLowerCase()
  if (sport === 'cycling') return s.includes('ride') || s.includes('cycl')
  if (sport === 'running') return s.includes('run')
  return false
}

// Returns average pace in seconds/km for running activities
function avgPaceSecPerKm(acts: any[]): number {
  const valid = acts.filter(a => a.average_speed > 0)
  if (!valid.length) return 360 // default 6:00/km
  const mps = valid.reduce((s: number, a: any) => s + a.average_speed, 0) / valid.length
  return 1000 / mps
}

// Returns average speed in km/h for cycling activities
function avgSpeedKmh(acts: any[]): number {
  const valid = acts.filter(a => a.average_speed > 0)
  if (!valid.length) return 25
  return valid.reduce((s: number, a: any) => s + a.average_speed, 0) / valid.length * 3.6
}

// Average weekly km over the last 4 weeks (of matching-sport activities)
function weeklyAvgKm(acts: any[]): number {
  const now = Date.now()
  const weeks = [0, 1, 2, 3].map(w => {
    const lo = now - (w + 1) * 7 * 86400000
    const hi = now - w * 7 * 86400000
    return acts
      .filter(a => { const d = new Date(a.start_date).getTime(); return d >= lo && d < hi })
      .reduce((s: number, a: any) => s + (a.distance ?? 0) / 1000, 0)
  })
  const nonZero = weeks.filter(w => w > 0)
  return nonZero.length ? Math.round(nonZero.reduce((s, w) => s + w, 0) / nonZero.length) : 0
}

// Days since most recent matching-sport activity
function daysSinceLast(acts: any[]): number {
  if (!acts.length) return 99
  return (Date.now() - new Date(acts[0].start_date).getTime()) / 86400000
}

function determineUserLevel(acts: any[], sport: SportType): UserLevel {
  if (acts.length < 3) return 'beginner'
  const recent = acts.slice(0, 8)
  const avgDistKm = recent.reduce((s: number, a: any) => s + (a.distance ?? 0), 0) / recent.length / 1000

  if (sport === 'running') {
    const secPerKm = avgPaceSecPerKm(recent)
    if (avgDistKm >= 12 || secPerKm < 270) return 'advanced'    // >12 km avg or sub-4:30
    if (avgDistKm >= 6  || secPerKm < 360) return 'intermediate' // >6 km avg or sub-6:00
    return 'beginner'
  }
  if (sport === 'cycling') {
    const spd = avgSpeedKmh(recent)
    if (avgDistKm >= 70 || spd >= 32) return 'advanced'
    if (avgDistKm >= 35 || spd >= 25) return 'intermediate'
    return 'beginner'
  }
  return 'beginner'
}

function detectTrainingType(title: string, acts: any[]): TrainingType {
  const t = title.toLowerCase()
  if (['herstel', 'recovery', 'easy', 'rustig', 'actief herstel'].some(k => t.includes(k))) return 'herstel'
  if (['interval', 'fartlek', 'herhaling', 'snelheid', 'vo2'].some(k => t.includes(k))) return 'interval'
  if (['tempo', 'drempel', 'threshold', 'lactaat'].some(k => t.includes(k))) return 'tempo'
  if (['lange duur', 'long run', 'lsd', '2u', '90min', 'lange rit'].some(k => t.includes(k))) return 'lang'
  // Context: trained yesterday → herstel
  if (daysSinceLast(acts) < 1.5 && acts.length > 0) return 'herstel'
  return 'zone2'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATION: Record<TrainingType, Record<UserLevel, number>> = {
  herstel:  { beginner: 25, intermediate: 35, advanced: 40  },
  zone2:    { beginner: 40, intermediate: 60, advanced: 75  },
  tempo:    { beginner: 30, intermediate: 40, advanced: 50  },
  interval: { beginner: 35, intermediate: 45, advanced: 55  },
  lang:     { beginner: 55, intermediate: 80, advanced: 110 },
}

const RUN_PACE_OFFSET: Record<TrainingType, number> = {
  herstel: +90, zone2: +45, tempo: -30, interval: -60, lang: +30,
}

const CYCLE_SPEED_FACTOR: Record<TrainingType, number> = {
  herstel: 0.75, zone2: 0.85, tempo: 0.95, interval: 1.0, lang: 0.80,
}

export const ZONE: Record<TrainingType, string> = {
  herstel: 'Zone 1', zone2: 'Zone 2', tempo: 'Zone 3–4', interval: 'Zone 4–5', lang: 'Zone 2',
}

export const TYPE_LABEL: Record<TrainingType, string> = {
  herstel: 'Recovery', zone2: 'Zone 2', tempo: 'Tempo', interval: 'Interval', lang: 'Long run',
}

export const TYPE_COLOR: Record<TrainingType, string> = {
  herstel: 'text-teal-400',
  zone2: 'text-indigo-400',
  tempo: 'text-orange-400',
  interval: 'text-red-400',
  lang: 'text-cyan-400',
}

// ─── Core algorithm ───────────────────────────────────────────────────────────

export function computeAdvice(sport: SportType, activities: any[], title: string): ComputeAdviceResult {
  const matching = activities.filter(a => matchesSport(a, sport))
  const activityCount = matching.length

  // strength/other never show the sparse-data banner: they don't use Strava volume.
  const isPersonalized = (sport === 'running' || sport === 'cycling')
    ? activityCount >= 3
    : true

  const trainingType = detectTrainingType(title, matching)
  const userLevel = determineUserLevel(matching, sport)
  const wkly = weeklyAvgKm(matching)

  let durationMin = DURATION[trainingType][userLevel]
  if (wkly > 60 && trainingType !== 'herstel') durationMin = Math.round(durationMin * 1.1)
  if (wkly > 0 && wkly < 20 && trainingType !== 'herstel') durationMin = Math.round(durationMin * 0.9)

  const zone = ZONE[trainingType]
  const levelLabel = userLevel.charAt(0).toUpperCase() + userLevel.slice(1)

  let advice: Advice

  if (sport === 'running') {
    const baseSecPerKm = matching.length ? avgPaceSecPerKm(matching) : 360
    const targetSecPerKm = Math.max(180, baseSecPerKm + RUN_PACE_OFFSET[trainingType])
    const paceMin = Math.floor(targetSecPerKm / 60)
    const paceSec = Math.round(targetSecPerKm % 60)
    const targetPace = `${paceMin}:${paceSec.toString().padStart(2, '0')}`
    const targetKm = Math.round((durationMin / (targetSecPerKm / 60)) * 10) / 10
    const parts = [`${TYPE_LABEL[trainingType]} · ${durationMin} min`, levelLabel]
    if (wkly) parts.push(`~${wkly} km/week`)
    advice = { sport, trainingType, userLevel, durationMin, targetKm, targetPace, targetSpeed: null, zone, basis: parts.join(' · ') }
  } else if (sport === 'cycling') {
    const baseSpeedKmh = matching.length ? avgSpeedKmh(matching) : 25
    const targetSpeed = Math.max(10, Math.round(baseSpeedKmh * CYCLE_SPEED_FACTOR[trainingType]))
    const targetKm = Math.round((durationMin / 60) * targetSpeed * 10) / 10
    const parts = [`${TYPE_LABEL[trainingType]} · ${durationMin} min`, levelLabel]
    if (wkly) parts.push(`~${wkly} km/week`)
    advice = { sport, trainingType, userLevel, durationMin, targetKm, targetPace: null, targetSpeed, zone, basis: parts.join(' · ') }
  } else {
    advice = { sport, trainingType: 'zone2', userLevel: 'beginner', durationMin: 0, targetKm: 0, targetPace: null, targetSpeed: null, zone: '–', basis: '–' }
  }

  return { advice, isPersonalized, activityCount }
}
