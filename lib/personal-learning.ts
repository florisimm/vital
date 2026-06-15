// Personal learning engine — derives individual physiological & behavioural
// parameters from a user's own history so coaching adapts to THEM, not the
// population average. Pure functions, no I/O. Each learned value degrades
// gracefully (returns null) when there isn't enough data to be trustworthy.

import type { HealthRow } from './readiness'

// Minimal structural types so this module stays decoupled from the big
// client component that owns the canonical Activity / HevyWorkout types.
export type ActivityLike = {
  start_date: string
  sport_type?: string | null
}
export type HevyLike = {
  start_time: string
}
export type CalEventLike = {
  title?: string | null
  start_date?: string
  start_datetime?: string | null
}

export interface LearnedInsight {
  icon: string
  title: string
  detail: string
}

export interface PersonalProfile {
  // 1. Personal HRV / RHR thresholds (baseline-relative, not population cutoffs)
  hrvBaseline: number | null
  hrvBadThreshold: number | null      // below this = a genuinely bad day FOR YOU
  rhrBaseline: number | null
  rhrBadThreshold: number | null      // above this = elevated FOR YOU

  // 2. Recovery speed — how fast HRV returns to baseline after training
  recoverySpeed: 'fast' | 'normal' | 'slow' | null
  recoveryDays: number | null         // days until HRV back near baseline

  // 3. Optimal sleep — sleep duration associated with your good days
  optimalSleepMinutes: number | null

  // 4. Behaviour — sports you consistently skip when planned
  skippedSports: { sport: string; planned: number; done: number; skipRate: number }[]

  // 5. Load tolerance — weekly session ceiling you sustain comfortably
  weeklySessionCeiling: number | null

  insights: LearnedInsight[]
  dataConfidence: 'none' | 'low' | 'medium' | 'high'
}

const SPORT_LABELS: Record<string, string> = {
  gym: 'Gym', strength: 'Gym', running: 'Running', cycling: 'Cycling', swimming: 'Swimming',
}

function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length }
function stddev(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length)
}

function sportOfActivity(a: ActivityLike): string {
  const t = (a.sport_type ?? '').toLowerCase()
  if (t.includes('run')) return 'running'
  if (t.includes('ride') || t.includes('cycl') || t.includes('bike')) return 'cycling'
  if (t.includes('swim')) return 'swimming'
  return 'other'
}

function sportOfEvent(title: string): string | null {
  const t = title.toLowerCase()
  if (['push', 'pull', 'legs', 'squat', 'gym', 'kracht', 'strength', 'bench', 'deadlift', 'hyrox'].some(k => t.includes(k))) return 'gym'
  if (['run', 'loop', 'hardloop', 'interval', 'tempo'].some(k => t.includes(k))) return 'running'
  if (['ride', 'fiet', 'cycl', 'bike'].some(k => t.includes(k))) return 'cycling'
  if (['swim', 'zwem'].some(k => t.includes(k))) return 'swimming'
  return null
}

export function computePersonalProfile(
  rows: HealthRow[],
  activities: ActivityLike[],
  hevy: HevyLike[],
  pastCalendarEvents: CalEventLike[] = [],
): PersonalProfile {
  const insights: LearnedInsight[] = []

  // ── 1. Personal HRV / RHR thresholds ──────────────────────────────────────
  const hrvVals = rows.filter(r => r.hrv_rmssd != null).slice(0, 60).map(r => r.hrv_rmssd as number)
  const rhrVals = rows.filter(r => r.hartslag_rust != null).slice(0, 60).map(r => r.hartslag_rust as number)

  let hrvBaseline: number | null = null
  let hrvBadThreshold: number | null = null
  if (hrvVals.length >= 10) {
    hrvBaseline = mean(hrvVals)
    hrvBadThreshold = Math.round((hrvBaseline - stddev(hrvVals, hrvBaseline)) * 10) / 10
    hrvBaseline = Math.round(hrvBaseline * 10) / 10
    insights.push({
      icon: '💓',
      title: 'Your HRV baseline',
      detail: `~${hrvBaseline} ms. Below ${hrvBadThreshold} ms signals a genuinely off day for you — not a generic cutoff.`,
    })
  }

  let rhrBaseline: number | null = null
  let rhrBadThreshold: number | null = null
  if (rhrVals.length >= 10) {
    rhrBaseline = mean(rhrVals)
    rhrBadThreshold = Math.round(rhrBaseline + stddev(rhrVals, rhrBaseline))
    rhrBaseline = Math.round(rhrBaseline)
    insights.push({
      icon: '❤️',
      title: 'Your resting HR baseline',
      detail: `~${rhrBaseline} bpm. Above ${rhrBadThreshold} bpm means elevated for you — a sign to ease off.`,
    })
  }

  // ── 2. Recovery speed ─────────────────────────────────────────────────────
  // Group each morning's HRV deviation by how many days since the last workout.
  // If deviation is already near/above baseline 1 day post-workout → fast.
  let recoverySpeed: PersonalProfile['recoverySpeed'] = null
  let recoveryDays: number | null = null
  if (hrvBaseline != null && hrvVals.length >= 14) {
    const workoutDays = new Set<string>([
      ...activities.map(a => a.start_date.slice(0, 10)),
      ...hevy.map(h => h.start_time.slice(0, 10)),
    ])
    const devByGap: Record<number, number[]> = { 1: [], 2: [], 3: [] }
    for (const r of rows) {
      if (r.hrv_rmssd == null) continue
      const day = new Date(r.datum + 'T00:00:00')
      // days since most recent workout strictly before this day
      let gap: number | null = null
      for (let g = 1; g <= 3; g++) {
        const prev = new Date(day.getTime() - g * 86400000).toISOString().slice(0, 10)
        if (workoutDays.has(prev)) { gap = g; break }
      }
      if (gap != null) {
        const devPct = ((r.hrv_rmssd as number) - hrvBaseline) / hrvBaseline * 100
        devByGap[gap].push(devPct)
      }
    }
    const avg = (xs: number[]) => xs.length >= 3 ? mean(xs) : null
    const d1 = avg(devByGap[1]); const d2 = avg(devByGap[2]); const d3 = avg(devByGap[3])
    // recovered = deviation ≥ -3% of baseline
    if (d1 != null && d1 >= -3) { recoverySpeed = 'fast'; recoveryDays = 1 }
    else if (d2 != null && d2 >= -3) { recoverySpeed = 'normal'; recoveryDays = 2 }
    else if (d3 != null && d3 >= -3) { recoverySpeed = 'slow'; recoveryDays = 3 }
    else if (d1 != null) { recoverySpeed = 'slow'; recoveryDays = 3 }

    if (recoverySpeed) {
      const label = recoverySpeed === 'fast' ? 'fast' : recoverySpeed === 'normal' ? 'average' : 'slower'
      insights.push({
        icon: '🔄',
        title: 'Your recovery speed',
        detail: recoverySpeed === 'fast'
          ? 'Your HRV is back to baseline the morning after training — you bounce back fast and can train more often.'
          : recoverySpeed === 'normal'
            ? 'Your HRV typically needs ~2 days to return to baseline after a session.'
            : 'Your HRV takes ~3 days to fully recover — spacing hard sessions out serves you better.',
      })
    }
  }

  // ── 3. Optimal sleep ──────────────────────────────────────────────────────
  // Average sleep on "good" days (HRV at/above baseline).
  let optimalSleepMinutes: number | null = null
  if (hrvBaseline != null) {
    const goodDaySleep: number[] = []
    for (const r of rows) {
      if (r.hrv_rmssd == null || r.slaap_minuten == null) continue
      if ((r.hrv_rmssd as number) >= hrvBaseline) goodDaySleep.push(r.slaap_minuten as number)
    }
    if (goodDaySleep.length >= 6) {
      optimalSleepMinutes = Math.round(mean(goodDaySleep))
      const h = Math.floor(optimalSleepMinutes / 60)
      const m = optimalSleepMinutes % 60
      insights.push({
        icon: '😴',
        title: 'Your sweet-spot sleep',
        detail: `On your best-recovery days you sleep about ${h}h ${m}m. Aim for that to train at your peak.`,
      })
    }
  }

  // ── 4. Skipped sports ─────────────────────────────────────────────────────
  const skippedSports: PersonalProfile['skippedSports'] = []
  if (pastCalendarEvents.length > 0) {
    const doneByDaySport = new Map<string, Set<string>>()
    const mark = (day: string, sport: string) => {
      if (!doneByDaySport.has(day)) doneByDaySport.set(day, new Set())
      doneByDaySport.get(day)!.add(sport)
    }
    for (const a of activities) mark(a.start_date.slice(0, 10), sportOfActivity(a))
    for (const h of hevy) mark(h.start_time.slice(0, 10), 'gym')

    const tally: Record<string, { planned: number; done: number }> = {}
    for (const e of pastCalendarEvents) {
      const sport = sportOfEvent(e.title ?? '')
      if (!sport) continue
      const day = (e.start_datetime || e.start_date || '').slice(0, 10)
      if (!day) continue
      tally[sport] ??= { planned: 0, done: 0 }
      tally[sport].planned++
      // matched if that sport was done within ±1 day
      const neighbours = [day,
        new Date(new Date(day).getTime() - 86400000).toISOString().slice(0, 10),
        new Date(new Date(day).getTime() + 86400000).toISOString().slice(0, 10)]
      const matched = neighbours.some(d => doneByDaySport.get(d)?.has(sport))
      if (matched) tally[sport].done++
    }
    for (const [sport, t] of Object.entries(tally)) {
      if (t.planned >= 3) {
        const skipRate = 1 - t.done / t.planned
        skippedSports.push({ sport, planned: t.planned, done: t.done, skipRate })
      }
    }
    skippedSports.sort((a, b) => b.skipRate - a.skipRate)
    const worst = skippedSports[0]
    if (worst && worst.skipRate >= 0.4) {
      insights.push({
        icon: '📉',
        title: `You often skip ${SPORT_LABELS[worst.sport] ?? worst.sport}`,
        detail: `Only ${worst.done}/${worst.planned} planned ${SPORT_LABELS[worst.sport] ?? worst.sport} sessions happened. Want fewer planned, or a different time of day?`,
      })
    }
  }

  // ── 5. Weekly session ceiling (load tolerance proxy) ──────────────────────
  let weeklySessionCeiling: number | null = null
  {
    const allDays = [
      ...activities.map(a => a.start_date.slice(0, 10)),
      ...hevy.map(h => h.start_time.slice(0, 10)),
    ].sort()
    if (allDays.length >= 10) {
      // rolling 7-day session counts, take the 90th percentile sustained ceiling
      const times = allDays.map(d => new Date(d + 'T00:00:00').getTime())
      const windowCounts: number[] = []
      for (let i = 0; i < times.length; i++) {
        const windowStart = times[i] - 6 * 86400000
        windowCounts.push(times.filter(t => t <= times[i] && t >= windowStart).length)
      }
      windowCounts.sort((a, b) => a - b)
      const p90 = windowCounts[Math.floor(windowCounts.length * 0.9)]
      weeklySessionCeiling = p90
      insights.push({
        icon: '🏋️',
        title: 'Your sustainable load',
        detail: `You comfortably handle up to ~${p90} sessions in a 7-day stretch. Pushing well past that raises injury risk for you.`,
      })
    }
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  const signals = [hrvBaseline, rhrBaseline, recoverySpeed, optimalSleepMinutes, weeklySessionCeiling].filter(v => v != null).length
  const dataConfidence: PersonalProfile['dataConfidence'] =
    signals === 0 ? 'none' : signals <= 1 ? 'low' : signals <= 3 ? 'medium' : 'high'

  return {
    hrvBaseline, hrvBadThreshold, rhrBaseline, rhrBadThreshold,
    recoverySpeed, recoveryDays, optimalSleepMinutes,
    skippedSports, weeklySessionCeiling,
    insights, dataConfidence,
  }
}
