// Shared training load calculation for readiness and performance scoring.
// Used by lib/readiness.ts and app/training/sections.tsx.

export type Activity = {
  id: number; name: string; sport_type: string; start_date: string
  distance: number | null; moving_time: number | null; elapsed_time: number | null
  total_elevation_gain: number | null; average_speed: number | null; max_speed?: number | null
  average_heartrate: number | null; max_heartrate?: number | null
  average_cadence: number | null; kilojoules: number | null
  average_watts?: number | null; weighted_average_watts?: number | null
  suffer_score?: number | null; map_polyline?: string | null
}

export type HevyWorkout = {
  id: string; title: string; start_time: string; end_time: string | null
  duration: number | null; volume_kg: number | null; sets: number | null
  exercises: Array<{ title: string; sets: Array<{ weight_kg: number; reps: number }> }> | null
}

// Sport type predicates
export function isRun(a: Activity) {
  return a.sport_type?.toLowerCase().includes('run')
}

export function isRide(a: Activity) {
  const t = a.sport_type?.toLowerCase() ?? ''
  return t.includes('ride') || t.includes('cycl')
}

export function isSwim(a: Activity) {
  return a.sport_type?.toLowerCase().includes('swim')
}

export function isWeightTraining(a: Activity) {
  return a.sport_type?.toLowerCase() === 'weighttraining'
}

export function isCycling(a: Activity) {
  return a.sport_type?.toLowerCase().includes('ride')
}

// Max heart rate from age (Tanaka 2001): more accurate than the old 220−age.
export function tanakaHRMax(age: number): number {
  return Math.round(208 - 0.7 * age)
}

// HR zone multiplier for effective load. When a personal hrMax is supplied the
// zones are %HRmax-relative (so a 50-yr-old and a 20-yr-old are scored on their
// own ranges); the fraction boundaries (0.684/0.789/0.868/0.921) reproduce the
// legacy absolute thresholds 130/150/165/175 exactly at hrMax ≈ 190. Without an
// hrMax the legacy absolute thresholds are used unchanged.
export function cardioZoneMultiplier(hr: number, hrMax?: number | null): number {
  if (hrMax && hrMax > 0) {
    const f = hr / hrMax
    if (f < 0.684) return 0.25  // Zone 1: recovery
    if (f < 0.789) return 0.50  // Zone 2: aerobic base
    if (f < 0.868) return 0.75  // Zone 3: aerobic threshold
    if (f < 0.921) return 1.00  // Zone 4: lactate threshold
    return 1.25                 // Zone 5: VO2max / race effort
  }
  if (hr < 130) return 0.25
  if (hr < 150) return 0.50
  if (hr < 165) return 0.75
  if (hr < 175) return 1.00
  return 1.25
}

// Effective load from cardio activity (minutes adjusted for intensity)
export function effectiveLoad(a: Activity, hrMax?: number | null): number {
  const mins = (a.moving_time ?? 0) / 60
  if (mins === 0) return 0
  if (a.average_heartrate) return mins * cardioZoneMultiplier(a.average_heartrate, hrMax)
  if (isRun(a) && a.average_speed) {
    const mps = a.average_speed
    return mins * (mps > 4.0 ? 1.00 : mps > 3.2 ? 0.75 : 0.50)
  }
  if (isRide(a) && a.average_speed) {
    const kmh = a.average_speed * 3.6
    return mins * (kmh > 30 ? 1.00 : kmh > 22 ? 0.75 : 0.50)
  }
  return mins * 0.75
}

const COMPOUND_KEYWORDS = [
  'squat', 'deadlift', 'rdl', 'bench', 'incline', 'overhead press', 'ohp',
  'shoulder press', 'military press', 'row', 'pull-up', 'pullup', 'pull up',
  'chin-up', 'chinup', 'chin up', 'lunge', 'hip thrust',
]
const ISOLATION_KEYWORDS = [
  'curl', 'tricep', 'lateral raise', 'rear delt', 'face pull',
  'calf', 'leg extension', 'leg curl', 'fly', 'flye', 'shrug', 'kickback',
]
const RECOVERY_TITLE_KEYWORDS = [
  'stretch', 'mobility', 'foam', 'recover', 'herstel',
  'warm up', 'warm-up', 'warmup', 'cooldown', 'cool down', 'cool-down',
]
const ACCESSORY_TITLE_KEYWORDS = ['abs', 'core', 'yoga']

// Estimated 1-rep max (Epley). Single rep returns the weight as-is.
export function epley1RM(weight_kg: number, reps: number): number {
  if (weight_kg <= 0 || reps <= 0) return 0
  return reps === 1 ? weight_kg : weight_kg * (1 + reps / 30)
}

// Intensity factor (0.4–1.5) normalized to 8 reps at typical working weight ≈ 1.0
export function setIntensityFactor(sets: Array<{ weight_kg: number; reps: number }>): number {
  const valid = (sets ?? []).filter(s => s.reps > 0)
  if (!valid.length) return 1.0
  const avg = valid.reduce((sum, s) => {
    if (s.weight_kg <= 0) return sum + (s.reps <= 10 ? 0.85 : 0.65)  // bodyweight
    const pct1rm = s.reps <= 1 ? 1.0 : 30 / (30 + s.reps)
    const repMod = s.reps <= 3 ? 1.35 : s.reps <= 6 ? 1.15 : s.reps <= 12 ? 1.0 : 0.7
    return sum + Math.min(1.5, pct1rm * repMod)
  }, 0) / valid.length
  return Math.max(0.4, avg)
}

// Load factor (0.10–1.0) for Hevy workouts based on exercise type
export function sessionLoadFactor(h: HevyWorkout): number {
  if (h.exercises && h.exercises.length > 0) {
    const totalSets = h.exercises.reduce((s, ex) => s + (ex.sets?.length ?? 0), 0)
    if (totalSets > 0) {
      let compEff = 0, isoEff = 0, otherEff = 0
      for (const ex of h.exercises) {
        const t = (ex.title ?? '').toLowerCase()
        const n = ex.sets?.length ?? 0
        const intensity = setIntensityFactor(ex.sets ?? [])
        if (COMPOUND_KEYWORDS.some(k => t.includes(k)))       compEff  += n * 1.0 * intensity
        else if (ISOLATION_KEYWORDS.some(k => t.includes(k))) isoEff   += n * 0.6 * intensity
        else                                                    otherEff += n * 0.25 * intensity
      }
      return (compEff + isoEff + otherEff) / totalSets
    }
  }
  const t = (h.title ?? '').toLowerCase()
  if (RECOVERY_TITLE_KEYWORDS.some(k => t.includes(k))) return 0.10
  if (ACCESSORY_TITLE_KEYWORDS.some(k => t.includes(k))) return 0.25
  return 1.0
}

// Effective load from strength workout (minutes × intensity factor)
export function hevyLoad(h: HevyWorkout): number {
  return (h.duration ?? 3600) / 60 * sessionLoadFactor(h)
}

// Splits hevyLoad(h) into compound / isolation / accessory components
export function sessionLoadBreakdown(h: HevyWorkout): { compound: number; isolation: number; accessory: number } {
  const mins = (h.duration ?? 3600) / 60
  if (h.exercises && h.exercises.length > 0) {
    const totalSets = h.exercises.reduce((s, ex) => s + (ex.sets?.length ?? 0), 0)
    if (totalSets > 0) {
      let compEff = 0, isoEff = 0, otherEff = 0
      for (const ex of h.exercises) {
        const t = (ex.title ?? '').toLowerCase()
        const n = ex.sets?.length ?? 0
        const intensity = setIntensityFactor(ex.sets ?? [])
        if (COMPOUND_KEYWORDS.some(k => t.includes(k)))       compEff  += n * 1.0 * intensity
        else if (ISOLATION_KEYWORDS.some(k => t.includes(k))) isoEff   += n * 0.6 * intensity
        else                                                    otherEff += n * 0.25 * intensity
      }
      const totalEff = compEff + isoEff + otherEff
      if (totalEff === 0) return { compound: 0, isolation: 0, accessory: mins * 0.25 }
      const load = hevyLoad(h)
      return {
        compound:  (compEff / totalEff) * load,
        isolation: (isoEff / totalEff) * load,
        accessory: (otherEff / totalEff) * load,
      }
    }
  }
  const load = hevyLoad(h)
  return sessionLoadFactor(h) > 0.30
    ? { compound: load, isolation: 0, accessory: 0 }
    : { compound: 0,    isolation: 0, accessory: load }
}

// Session is accessory/recovery if load factor ≤ 0.30
export function isAccessorySession(h: HevyWorkout): boolean {
  return sessionLoadFactor(h) <= 0.30
}

// Export keyword constants for exercises
export { COMPOUND_KEYWORDS, ISOLATION_KEYWORDS, RECOVERY_TITLE_KEYWORDS, ACCESSORY_TITLE_KEYWORDS }

// Week-over-week load ratio (acute7 / prev7) and ramp rate (%). Both exclude
// accessory/recovery sessions for a consistent apples-to-apples comparison.
// rampRate is null when prior-week load is too low to be meaningful (<5 load units).
export function computeLoadRatio(activities: Activity[], hevy: HevyWorkout[], hrMax?: number | null): { ratio: number; rampRate: number | null } {
  const now = Date.now()
  const t7  = new Date(now - 7  * 86400000).toISOString()
  const t14 = new Date(now - 14 * 86400000).toISOString()

  const acute7 = activities.filter(a => a.start_date >= t7).reduce((s, a) => s + effectiveLoad(a, hrMax), 0)
    + hevy.filter(h => h.start_time >= t7 && !isAccessorySession(h)).reduce((s, h) => s + hevyLoad(h), 0)
  const prev7  = activities.filter(a => a.start_date >= t14 && a.start_date < t7).reduce((s, a) => s + effectiveLoad(a, hrMax), 0)
    + hevy.filter(h => h.start_time >= t14 && h.start_time < t7 && !isAccessorySession(h)).reduce((s, h) => s + hevyLoad(h), 0)

  const ratio = prev7 > 0 ? acute7 / prev7 : 1
  const rampRate = prev7 > 5 ? Math.max(-100, Math.min(200, Math.round((acute7 - prev7) / prev7 * 100))) : null
  return { ratio, rampRate }
}

export function computeRampRate(activities: Activity[], hevy: HevyWorkout[], hrMax?: number | null): number | null {
  return computeLoadRatio(activities, hevy, hrMax).rampRate
}

// Banister-style fitness / fatigue / form from a daily training-load series.
//  CTL (fitness)  = 42-day EWMA of daily load
//  ATL (fatigue)  =  7-day EWMA of daily load
//  TSB (form)     = CTL − ATL  (positive = fresh/tapered, negative = loaded)
// Adds the chronic-fitness context the acute-only recovery % can't capture — it
// distinguishes a fit athlete carrying fatigue from a detrained one. Additive:
// nothing else depends on it.
export function computeTrainingForm(activities: Activity[], hevy: HevyWorkout[], hrMax?: number | null): {
  ctl: number; atl: number; tsb: number; label: string
} {
  const dayMs = 86400000
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const DAYS = 56
  const daily = new Array(DAYS).fill(0)
  const idxOf = (iso: string) => {
    const d = Math.floor((todayMs - new Date(iso.slice(0, 10)).getTime()) / dayMs)
    return d >= 0 && d < DAYS ? DAYS - 1 - d : -1 // oldest → newest
  }
  for (const a of activities) { const i = idxOf(a.start_date); if (i >= 0) daily[i] += effectiveLoad(a, hrMax) }
  for (const h of hevy)       { const i = idxOf(h.start_time); if (i >= 0) daily[i] += hevyLoad(h) }

  const kCtl = 2 / (42 + 1), kAtl = 2 / (7 + 1)
  let ctl = 0, atl = 0
  for (let i = 0; i < DAYS; i++) {
    ctl += kCtl * (daily[i] - ctl)
    atl += kAtl * (daily[i] - atl)
  }
  const tsb = ctl - atl
  const label = tsb > 5 ? 'Fresh' : tsb > -10 ? 'Balanced' : tsb > -25 ? 'Building' : 'Overreaching'
  return { ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(tsb), label }
}

// Training load score (0–100) for readiness calculation.
// Uses ACWR, session density, and consecutive training days.
// Score is inverse: high load = low score (more recovery needed).
export function computeTrainingLoadScore(activities: Activity[], hevy: HevyWorkout[]): {
  score: number  // 0–100, where 100 = fully rested, 0 = extreme overload
  volume7d: number  // total load units (kJ equivalent)
  sessionCount7d: number
  consecutiveDays: number
  acwr: number | null
  status: 'rested' | 'normal' | 'elevated' | 'high' | 'very_high'
} {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  // Load calculation: kJ for cardio, minutes × factor for strength
  const kj7 = activities.filter(a => a.start_date >= sevenDaysAgo).reduce((s, a) => s + effectiveLoad(a), 0)
    + hevy.filter(h => h.start_time >= sevenDaysAgo).reduce((s, h) => s + hevyLoad(h), 0)
  const kj14to7 = activities.filter(a => a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo).reduce((s, a) => s + effectiveLoad(a), 0)
    + hevy.filter(h => h.start_time >= fourteenDaysAgo && h.start_time < sevenDaysAgo).reduce((s, h) => s + hevyLoad(h), 0)

  // ACWR: Acute (7d) / Chronic (28d average)
  const kj28 = activities.filter(a => a.start_date >= thirtyDaysAgo).reduce((s, a) => s + effectiveLoad(a), 0)
    + hevy.filter(h => h.start_time >= thirtyDaysAgo).reduce((s, h) => s + hevyLoad(h), 0)
  const acwr = kj28 > 0 ? kj7 / (kj28 / 4) : null

  // Session count and consecutive days
  const sessions7d = [
    ...new Set([
      ...activities.filter(a => a.start_date >= sevenDaysAgo).map(a => a.start_date.slice(0, 10)),
      ...hevy.filter(h => h.start_time >= sevenDaysAgo).map(h => h.start_time.slice(0, 10)),
    ]),
  ].length

  // Consecutive training days (streak)
  const allDates = [
    ...activities.map(a => new Date(a.start_date).getTime()),
    ...hevy.map(h => new Date(h.start_time).getTime()),
  ].sort((a, b) => b - a)
  const dayMs = 86400000
  let consecutiveDays = 0
  if (allDates.length > 0) {
    let lastDate = allDates[0]
    for (let i = 1; i < allDates.length; i++) {
      if (lastDate - allDates[i] <= dayMs * 1.1) {  // Allow 1.1 day gap
        consecutiveDays++
        lastDate = allDates[i]
      } else {
        break
      }
    }
  }

  // Score calculation: inverse (high load → low readiness)
  let score = 100

  // ACWR penalty: 0.8–1.3 is ideal, <0.8 is deload, >1.5 is overload
  if (acwr !== null) {
    if (acwr > 1.5) score -= 60  // Very high load
    else if (acwr > 1.3) score -= 40  // High load
    else if (acwr > 1.1) score -= 20  // Elevated
    else if (acwr < 0.8) score -= 10  // Deload (mild penalty, recovery is good)
  }

  // Session density penalty: >6 sessions/week is fatiguing
  if (sessions7d > 6) score -= Math.min(20, (sessions7d - 6) * 5)
  else if (sessions7d > 4) score -= 5

  // Consecutive days penalty: >5 consecutive days compounds fatigue
  if (consecutiveDays > 6) score -= Math.min(30, (consecutiveDays - 6) * 8)
  else if (consecutiveDays > 4) score -= 10

  // Ensure score is in [0, 100]
  score = Math.max(0, Math.min(100, score))

  const status: 'rested' | 'normal' | 'elevated' | 'high' | 'very_high' =
    score >= 80 ? 'rested'
    : score >= 65 ? 'normal'
    : score >= 50 ? 'elevated'
    : score >= 35 ? 'high'
    : 'very_high'

  return {
    score,
    volume7d: kj7,
    sessionCount7d: sessions7d,
    consecutiveDays,
    acwr,
    status,
  }
}
