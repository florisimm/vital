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
  progressionRate: number | null  // learned % per session (null = no history)
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

// Activities that were actually ridden/run at the requested training type
// (classified by HR + duration). Lets us read the user's real Zone 2 pace/speed
// straight from their history instead of scaling the all-rides average by a
// blanket factor. (Function declarations are hoisted, so calling
// classifyActivityType here is fine.)
function sameTypeActivities(acts: any[], sport: SportType, type: TrainingType): any[] {
  return acts.filter(a => a.average_speed > 0 && classifyActivityType(a, sport) === type)
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

// Km done in the current rolling 7-day window
function weeklyKmNow(acts: any[]): number {
  const lo = Date.now() - 7 * 86400000
  return acts
    .filter(a => new Date(a.start_date).getTime() >= lo)
    .reduce((s, a) => s + (a.distance ?? 0) / 1000, 0)
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

function detectTrainingType(title: string, acts: any[], sport?: SportType): TrainingType {
  const t = title.toLowerCase()
  if (['interval', 'fartlek', 'herhaling', 'snelheid', 'vo2'].some(k => t.includes(k))) return 'interval'
  if (['tempo', 'drempel', 'threshold', 'lactaat'].some(k => t.includes(k))) return 'tempo'
  // Cycling only has zone2 or interval — no herstel/lang
  if (sport === 'cycling') return 'zone2'
  if (['herstel', 'recovery', 'easy', 'rustig', 'actief herstel'].some(k => t.includes(k))) return 'herstel'
  if (['lange duur', 'long run', 'lsd', '2u', '90min', 'lange rit'].some(k => t.includes(k))) return 'lang'
  // Context: trained yesterday → herstel
  if (daysSinceLast(acts) < 1.5 && acts.length > 0) return 'herstel'
  return 'zone2'
}

// Classify a historical Strava activity into a training type using HR + duration.
// Used to find past sessions of the same type for progressive overload.
function classifyActivityType(a: any, sport: SportType): TrainingType {
  const minDur = (a.moving_time ?? 0) / 60
  const hr = a.average_heartrate ?? 0
  const hrPct = hr > 0 ? hr / 190 : 0 // HRmax default 190

  if (minDur < 28) return 'herstel'
  if (hrPct > 0.88) return 'interval'
  if (hrPct > 0.80) return 'tempo'
  if (sport === 'running' && minDur > 85) return 'lang'
  if (sport === 'cycling' && minDur > 120) return 'lang'
  return 'zone2'
}

// Linear regression on session durations (sorted oldest→newest).
// Returns learned progression rate per session as a fraction.
// Clamped to [-5%, +10%].
function computeProgressionRate(sessions: any[]): number {
  const durations = sessions.map(a => (a.moving_time ?? 0) / 60).filter(d => d > 5)
  if (durations.length < 3) return 0 // not enough data
  const n = durations.length
  const xMean = (n - 1) / 2
  const yMean = durations.reduce((s, v) => s + v, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (durations[i] - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den > 0 ? num / den : 0
  const ratePerSession = yMean > 0 ? slope / yMean : 0
  return Math.max(-0.05, Math.min(0.10, ratePerSession))
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATION: Record<TrainingType, Record<UserLevel, number>> = {
  herstel:  { beginner: 25, intermediate: 35, advanced: 40  },
  zone2:    { beginner: 40, intermediate: 60, advanced: 75  },
  tempo:    { beginner: 30, intermediate: 40, advanced: 50  },
  interval: { beginner: 35, intermediate: 45, advanced: 55  },
  lang:     { beginner: 55, intermediate: 80, advanced: 110 },
}

// Default progression rate per session (used until enough history to learn from)
const DEFAULT_PROGRESSION: Record<TrainingType, number> = {
  herstel:  0,
  zone2:    0.07,
  tempo:    0.05,
  interval: 0.03,
  lang:     0.05,
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

const INTENSITY_SCALE: Record<string, number> = { easy: 0.9, moderate: 1.0, hard: 1.1, all_out: 1.2 }

export function computeAdvice(sport: SportType, activities: any[], title: string, intensity?: string, recoveryPct?: number): ComputeAdviceResult {
  const matching = activities.filter(a => matchesSport(a, sport))
  const activityCount = matching.length

  const isPersonalized = (sport === 'running' || sport === 'cycling')
    ? activityCount >= 3
    : true

  const trainingType = detectTrainingType(title, matching, sport)
  const userLevel = determineUserLevel(matching, sport)
  const wkly = weeklyAvgKm(matching)

  // Base duration from level matrix
  let durationMin = DURATION[trainingType][userLevel]
  let progressionRate: number | null = null
  let progressBasis = ''

  if (trainingType !== 'herstel' && matching.length >= 2) {
    // Find previous sessions of the same type (sorted oldest→newest, last 8)
    const sameSessions = matching
      .filter(a => classifyActivityType(a, sport) === trainingType)
      .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date))
      .slice(-8)

    const lastSession = sameSessions[sameSessions.length - 1]
    const lastDur = lastSession ? (lastSession.moving_time ?? 0) / 60 : 0

    if (lastDur > 10) {
      // Safety gate: already elevated volume this week → hold current level
      const thisWeekKm = weeklyKmNow(matching)
      const overloaded = wkly > 0 && thisWeekKm > wkly * 1.15

      if (overloaded) {
        durationMin = Math.round(lastDur)
        progressionRate = 0
        progressBasis = `Belasting hoog (${Math.round(thisWeekKm)} km deze week vs gem. ${wkly} km) — zelfde als vorige sessie`
      } else {
        // Compute learned rate from history, fall back to default
        const learnedRate = sameSessions.length >= 3 ? computeProgressionRate(sameSessions) : null
        const effectiveRate = learnedRate !== null
          ? Math.max(learnedRate, DEFAULT_PROGRESSION[trainingType] * 0.5) // floor at half default
          : DEFAULT_PROGRESSION[trainingType]

        durationMin = Math.round(lastDur * (1 + effectiveRate))
        progressionRate = effectiveRate

        const pctStr = `+${Math.round(effectiveRate * 100)}%`
        if (learnedRate !== null && sameSessions.length >= 3) {
          progressBasis = `Geleerd: ${pctStr}/sessie van je laatste ${sameSessions.length} ${TYPE_LABEL[trainingType].toLowerCase()} sessies`
        } else {
          progressBasis = `Progressie: ${pctStr} t.o.v. je vorige ${TYPE_LABEL[trainingType].toLowerCase()} (${Math.round(lastDur)} min)`
        }
      }
    } else {
      // No usable same-type history — use matrix + volume adjustment
      if (wkly > 60) durationMin = Math.round(durationMin * 1.1)
      if (wkly > 0 && wkly < 20) durationMin = Math.round(durationMin * 0.9)
    }
  } else if (trainingType !== 'herstel') {
    // Fewer than 2 activities total — plain matrix with volume adjustment
    if (wkly > 60) durationMin = Math.round(durationMin * 1.1)
    if (wkly > 0 && wkly < 20) durationMin = Math.round(durationMin * 0.9)
  }

  // Scale duration by intensity preference (herstel sessions are never stretched)
  if (trainingType !== 'herstel' && intensity && INTENSITY_SCALE[intensity]) {
    durationMin = Math.round(durationMin * INTENSITY_SCALE[intensity])
  }

  // Scale down when recovery is poor — always applied regardless of intensity
  if (recoveryPct !== undefined && recoveryPct < 65) {
    const recoveryScale = recoveryPct < 50 ? 0.8 : 0.9
    durationMin = Math.round(durationMin * recoveryScale)
  }

  const zone = ZONE[trainingType]
  const levelLabel = userLevel.charAt(0).toUpperCase() + userLevel.slice(1)

  let advice: Advice

  if (sport === 'running') {
    // Prefer the user's real pace for this exact training type; fall back to the
    // all-runs average shifted by the type offset when there's too little history.
    const sameType = sameTypeActivities(matching, sport, trainingType)
    let targetSecPerKm: number
    let paceFromHistory = false
    if (sameType.length >= 2) {
      targetSecPerKm = Math.max(180, Math.round(avgPaceSecPerKm(sameType)))
      paceFromHistory = true
    } else {
      const baseSecPerKm = matching.length ? avgPaceSecPerKm(matching) : 360
      targetSecPerKm = Math.max(180, baseSecPerKm + RUN_PACE_OFFSET[trainingType])
    }
    const paceMin = Math.floor(targetSecPerKm / 60)
    const paceSec = Math.round(targetSecPerKm % 60)
    const targetPace = `${paceMin}:${paceSec.toString().padStart(2, '0')}`
    const targetKm = Math.round((durationMin / (targetSecPerKm / 60)) * 10) / 10
    const parts = [`${TYPE_LABEL[trainingType]} · ${durationMin} min`, levelLabel]
    if (progressBasis) parts.push(progressBasis)
    else if (paceFromHistory) parts.push(`Pace uit je ${sameType.length} ${TYPE_LABEL[trainingType].toLowerCase()} runs`)
    else if (wkly) parts.push(`~${wkly} km/week`)
    advice = { sport, trainingType, userLevel, durationMin, targetKm, targetPace, targetSpeed: null, zone, basis: parts.join(' · '), progressionRate }
  } else if (sport === 'cycling') {
    // Prefer the user's real speed for this exact training type; fall back to the
    // all-rides average scaled by the type factor when there's too little history.
    const sameType = sameTypeActivities(matching, sport, trainingType)
    let targetSpeed: number
    let speedFromHistory = false
    if (sameType.length >= 2) {
      targetSpeed = Math.max(10, Math.round(avgSpeedKmh(sameType)))
      speedFromHistory = true
    } else {
      const baseSpeedKmh = matching.length ? avgSpeedKmh(matching) : 25
      targetSpeed = Math.max(10, Math.round(baseSpeedKmh * CYCLE_SPEED_FACTOR[trainingType]))
    }
    const targetKm = Math.round((durationMin / 60) * targetSpeed * 10) / 10
    const parts = [`${TYPE_LABEL[trainingType]} · ${durationMin} min`, levelLabel]
    if (progressBasis) parts.push(progressBasis)
    else if (speedFromHistory) parts.push(`Snelheid uit je ${sameType.length} ${TYPE_LABEL[trainingType].toLowerCase()} ritten`)
    else if (wkly) parts.push(`~${wkly} km/week`)
    advice = { sport, trainingType, userLevel, durationMin, targetKm, targetPace: null, targetSpeed, zone, basis: parts.join(' · '), progressionRate }
  } else {
    advice = { sport, trainingType: 'zone2', userLevel: 'beginner', durationMin: 0, targetKm: 0, targetPace: null, targetSpeed: null, zone: '–', basis: '–', progressionRate: null }
  }

  return { advice, isPersonalized, activityCount }
}
