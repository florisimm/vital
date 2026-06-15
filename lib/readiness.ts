// Shared physiology / readiness utilities — single source of truth used by
// Health and Training tabs so both show the same numbers.

import { localDateStr } from './timeFormat'
import { computeTrainingLoadScore, type Activity, type HevyWorkout } from './training-load'

export type HealthRow = {
  datum: string
  stappen?: number | null
  gewicht?: number | null
  hartslag_rust: number | null
  hrv_rmssd: number | null
  slaap_minuten: number | null
  slaap_score?: number | null
  slaap_diep: number | null
  slaap_rem: number | null
  wakker_minuten: number | null
  wakker_count: number | null
  spo2: number | null
  ademhalingsfrequentie: number | null
}

export type ReadinessExplanation = {
  positive: string[]
  negative: string[]
  primary_driver: 'sleep' | 'hrv' | 'training_load'
}

export type ReadinessConfidence = {
  level: 'high' | 'medium' | 'low'
  reason: string
  data_days: number
}

// Composite sleep score (0–100) calibrated to approximate Fitbit's score.
export function computeSleepScore(r: HealthRow): number | null {
  const asleep = r.slaap_minuten
  if (!asleep) return null
  const awake = r.wakker_minuten ?? 0
  const deep  = r.slaap_diep ?? 0
  const rem   = r.slaap_rem ?? 0
  const duration    = Math.min(asleep / 480, 1) ** 2
  const composition = Math.min((deep + rem) / asleep / 0.55, 1)
  const efficiency  = Math.max(0, Math.min((asleep / (asleep + awake) - 0.75) / 0.25, 1))
  const parts: [number, number][] = [[duration, 0.5], [composition, 0.35], [efficiency, 0.15]]
  if (r.wakker_count != null) {
    const restlessness = Math.max(0, Math.min(1 - (r.wakker_count - 1) / 12, 1))
    parts[0][1] = 0.45; parts[1][1] = 0.30; parts[2][1] = 0.10
    parts.push([restlessness, 0.15])
  }
  const totalWeight = parts.reduce((s, [, w]) => s + w, 0)
  return Math.round((parts.reduce((s, [v, w]) => s + v * w, 0) / totalWeight) * 100)
}

// Recovery Score: physiological recovery based on sleep and HRV only
// Indicates how recovered the body is (independent of training context).
// Weighting: Sleep 50% + HRV 50%
export function computeRecoveryScore(rows: HealthRow[]): {
  score: number | null
  label: string
  color: string
  components: {
    sleep: { value: number | null; status: string }
    hrv: { value: number | null; status: string; devPct: number | null }
  }
  explanation: ReadinessExplanation
} {
  const noData = {
    score: null,
    label: '–',
    color: 'rgba(255,255,255,0.3)',
    components: {
      sleep: { value: null, status: 'no data' },
      hrv: { value: null, status: 'no data', devPct: null },
    },
    explanation: { positive: [], negative: [], primary_driver: 'sleep' as const },
  }

  const todayStr = localDateStr()
  const todayRow = rows.find(r => r.datum === todayStr) ?? null

  // Sleep (0–1)
  const sleepRows = rows.filter(r => r.slaap_minuten != null)
  const sleepScore = todayRow?.slaap_minuten != null
    ? computeSleepScore(todayRow)
    : sleepRows.length >= 2
      ? Math.round(sleepRows.slice(0, 7).reduce((s, r) => s + (computeSleepScore(r) ?? 0), 0) / Math.min(sleepRows.length, 7))
      : null
  const sleepComponent = sleepScore != null ? sleepScore / 100 : null

  // HRV (0–1)
  const hrvRows = rows.filter(r => r.hrv_rmssd != null)
  const todayHRV = todayRow?.hrv_rmssd ?? null
  let hrvComponent: number | null = null
  let hrvDevPct: number | null = null
  if (todayHRV != null) {
    const hist = hrvRows.slice(1, 31).map(r => r.hrv_rmssd as number)
    if (hist.length >= 4) {
      const baseline = hist.reduce((a, b) => a + b, 0) / hist.length
      hrvDevPct = Math.round(((todayHRV - baseline) / baseline) * 100)
      hrvComponent = Math.max(0, Math.min(1, 0.5 + (todayHRV - baseline) / baseline / 0.6))
    } else {
      hrvComponent = todayHRV / (todayHRV + 50)
    }
  }

  // Weighted recovery: Sleep 50% + HRV 50%
  const components: Array<[number | null, number, string]> = [
    [sleepComponent, 50, 'sleep'],
    [hrvComponent, 50, 'hrv'],
  ]
  const available = components.filter(([v]) => v != null) as Array<[number, number, string]>
  if (available.length === 0) return noData

  const totalWeight = available.reduce((s, [, w]) => s + w, 0)
  const score = Math.round(available.reduce((s, [v, w]) => s + v * w, 0) / totalWeight * 100)

  // Explanation
  const positive: string[] = []
  const negative: string[] = []

  if (sleepComponent !== null) {
    if (sleepComponent >= 0.85) positive.push('Excellent sleep')
    else if (sleepComponent >= 0.75) positive.push('Good sleep')
    else if (sleepComponent < 0.6) negative.push(`Poor sleep (${sleepScore}%)`)
    else if (sleepComponent < 0.7) negative.push(`Below-average sleep (${sleepScore}%)`)
  }

  if (hrvComponent !== null) {
    if (hrvDevPct !== null && hrvDevPct > 10) positive.push(`HRV elevated (+${hrvDevPct}%)`)
    else if (hrvDevPct !== null && hrvDevPct > 5) positive.push('HRV stable')
    else if (hrvDevPct !== null && hrvDevPct < -15) negative.push(`HRV suppressed (${hrvDevPct}%)`)
    else if (hrvDevPct !== null && hrvDevPct < -5) negative.push(`HRV below baseline (${hrvDevPct}%)`)
  }

  const deficits = available.map(([v, w, name]) => ({
    name: name as 'sleep' | 'hrv' | 'training_load',
    deficit: w * (1 - (v ?? 0)),
    v: v ?? 0,
  }))
  deficits.sort((a, b) => b.deficit - a.deficit)
  const primary_driver = deficits[0]?.name ?? 'sleep'

  const label = score >= 85 ? 'Excellent'
    : score >= 70 ? 'Good'
    : score >= 50 ? 'Moderate'
    : 'Low'

  const color = score >= 85 ? '#4ade80'
    : score >= 70 ? '#2dd4bf'
    : score >= 50 ? '#fb923c'
    : '#f87171'

  return {
    score,
    label,
    color,
    components: {
      sleep: { value: sleepScore, status: sleepComponent ? (sleepComponent >= 0.75 ? 'good' : sleepComponent >= 0.6 ? 'ok' : 'poor') : 'no data' },
      hrv: { value: Math.round(todayHRV ?? 0), status: hrvComponent ? (hrvDevPct !== null ? (hrvDevPct > 5 ? 'elevated' : hrvDevPct < -10 ? 'suppressed' : 'stable') : 'unknown') : 'no data', devPct: hrvDevPct },
    },
    explanation: { positive, negative, primary_driver },
  }
}

// Helper: Calculate confidence in readiness score based on data availability
function computeReadinessConfidence(rows: HealthRow[], activities: Activity[], hevy: HevyWorkout[]): ReadinessConfidence {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  // Count days with health data (sleep or HRV)
  const healthDataDays = rows.filter(r => r.slaap_minuten != null || r.hrv_rmssd != null).length

  // Count training sessions
  const trainingDays = new Set([
    ...activities.filter(a => a.start_date >= thirtyDaysAgo).map(a => a.start_date.slice(0, 10)),
    ...hevy.filter(h => h.start_time >= thirtyDaysAgo).map(h => h.start_time.slice(0, 10)),
  ]).size

  const totalDataPoints = healthDataDays + trainingDays

  // Confidence assessment
  if (healthDataDays < 5 && trainingDays < 5) {
    return {
      level: 'low',
      reason: `Limited data: only ${healthDataDays} health days and ${trainingDays} training days`,
      data_days: healthDataDays,
    }
  }

  if (healthDataDays < 10 || trainingDays < 3) {
    return {
      level: 'medium',
      reason: `Some data missing: ${healthDataDays} health days, ${trainingDays} training days (need 15+ total for high confidence)`,
      data_days: healthDataDays,
    }
  }

  return {
    level: 'high',
    reason: `Sufficient data from ${healthDataDays} health days and ${trainingDays} training days`,
    data_days: healthDataDays,
  }
}

// Training Readiness: Recovery Score + Training Load + Weekly Goals context
// Indicates whether today is suitable for hard training.
// Weighting: Sleep 40% + HRV 40% + Training Load 20%
export function computePhysiologyReadiness(
  rows: HealthRow[],
  activities: Activity[] = [],
  hevy: HevyWorkout[] = []
): {
  score: number | null
  label: string
  color: string
  components: {
    sleep: { value: number | null; status: string }
    hrv: { value: number | null; status: string; devPct: number | null }
    training_load: { value: number | null; status: string }
  }
  explanation: ReadinessExplanation
  confidence: ReadinessConfidence
} {
  const noData = {
    score: null,
    label: '–',
    color: 'rgba(255,255,255,0.3)',
    components: {
      sleep: { value: null, status: 'no data' },
      hrv: { value: null, status: 'no data', devPct: null },
      training_load: { value: null, status: 'no data' },
    },
    explanation: { positive: [], negative: [], primary_driver: 'sleep' as const },
  }

  const todayStr = localDateStr()
  const todayRow = rows.find(r => r.datum === todayStr) ?? null

  // Get recovery first (Sleep + HRV)
  const recovery = computeRecoveryScore(rows)
  const sleepScore = recovery.components.sleep.value
  const sleepComponent = sleepScore != null ? sleepScore / 100 : null
  const hrvComponent = recovery.components.hrv.value != null ? recovery.components.hrv.value / 100 : null
  const hrvDevPct = recovery.components.hrv.devPct

  // Training load (0–1)
  let loadComponent: number | null = null
  let loadScore: number | null = null
  let loadStatus = 'no data'

  if (activities.length > 0 || hevy.length > 0) {
    const trainingLoad = computeTrainingLoadScore(activities, hevy)
    loadComponent = trainingLoad.score / 100
    loadScore = trainingLoad.score
    loadStatus = trainingLoad.status
  }

  // Weighted readiness: Sleep 40% + HRV 40% + Training Load 20%
  const components: Array<[number | null, number, string]> = [
    [sleepComponent, 40, 'sleep'],
    [hrvComponent, 40, 'hrv'],
    [loadComponent, 20, 'training_load'],
  ]
  const available = components.filter(([v]) => v != null) as Array<[number, number, string]>
  if (available.length === 0) return noData

  const totalWeight = available.reduce((s, [, w]) => s + w, 0)
  const score = Math.round(available.reduce((s, [v, w]) => s + v * w, 0) / totalWeight * 100)

  // Explanation
  const positive: string[] = []
  const negative: string[] = []

  if (sleepComponent !== null) {
    if (sleepComponent >= 0.85) positive.push('Excellent sleep')
    else if (sleepComponent >= 0.75) positive.push('Good sleep')
    else if (sleepComponent < 0.6) negative.push(`Poor sleep (${sleepScore}%)`)
    else if (sleepComponent < 0.7) negative.push(`Below-average sleep (${sleepScore}%)`)
  }

  if (hrvComponent !== null) {
    if (hrvDevPct !== null && hrvDevPct > 10) positive.push(`HRV elevated (+${hrvDevPct}%)`)
    else if (hrvDevPct !== null && hrvDevPct > 5) positive.push('HRV stable')
    else if (hrvDevPct !== null && hrvDevPct < -15) negative.push(`HRV suppressed (${hrvDevPct}%)`)
    else if (hrvDevPct !== null && hrvDevPct < -5) negative.push(`HRV below baseline (${hrvDevPct}%)`)
  }

  if (loadComponent !== null) {
    if (loadComponent >= 0.8) positive.push('Training load low — full recovery')
    else if (loadComponent >= 0.6) positive.push('Training load normal')
    else if (loadComponent >= 0.4) negative.push('Training load elevated')
    else negative.push('Training load very high')
  }

  const deficits = available.map(([v, w, name]) => ({
    name: name as 'sleep' | 'hrv' | 'training_load',
    deficit: w * (1 - (v ?? 0)),
    v: v ?? 0,
  }))
  deficits.sort((a, b) => b.deficit - a.deficit)
  const primary_driver = deficits[0]?.name ?? 'sleep'

  const label = score >= 80 ? 'Peak'
    : score >= 65 ? 'Good'
    : score >= 50 ? 'Moderate'
    : 'Low'

  const color = score >= 80 ? '#4ade80'
    : score >= 65 ? '#2dd4bf'
    : score >= 50 ? '#fb923c'
    : '#f87171'

  const confidence = computeReadinessConfidence(rows, activities, hevy)

  return {
    score,
    label,
    color,
    components: {
      sleep: { value: sleepScore, status: recovery.components.sleep.status },
      hrv: { value: recovery.components.hrv.value, status: recovery.components.hrv.status, devPct: hrvDevPct },
      training_load: { value: loadScore, status: loadStatus },
    },
    explanation: { positive, negative, primary_driver },
    confidence,
  }
}

// HRV baseline stats from the last 30 days.
// Used to show baseline bands on charts and deviation % in metric tiles.
export function computeHRVBaseline(rows: HealthRow[]): {
  baseline: number | null
  stddev: number | null
  deviationPct: number | null
  todayHRV: number | null
} {
  const hrvRows = rows.filter(r => r.hrv_rmssd != null).slice(0, 30)
  if (hrvRows.length < 5) return { baseline: null, stddev: null, deviationPct: null, todayHRV: null }
  const vals = hrvRows.map(r => r.hrv_rmssd as number)
  const baseline = vals.reduce((a, b) => a + b, 0) / vals.length
  const stddev = Math.sqrt(vals.reduce((s, v) => s + (v - baseline) ** 2, 0) / vals.length)
  const todayHRV = vals[0]
  const deviationPct = baseline > 0 ? Math.round(((todayHRV - baseline) / baseline) * 100) : null
  return {
    baseline: Math.round(baseline * 10) / 10,
    stddev: Math.round(stddev * 10) / 10,
    deviationPct,
    todayHRV,
  }
}

// RHR as separate warning signal — not part of readiness score.
// Illness / strain flag — fires when ≥2 vitals are clearly outside their
// 7-day baseline. Rule-based, no model needed.
export function computeIllnessFlag(rows: HealthRow[]): { reason: string } | null {
  if (rows.length < 4) return null
  const today = rows[0]
  const baseline = rows.slice(1, Math.min(8, rows.length))

  function bAvg(vals: (number | null)[]): number | null {
    const clean = vals.filter((v): v is number => v !== null)
    return clean.length >= 2 ? clean.reduce((a, b) => a + b, 0) / clean.length : null
  }

  const avgRHR  = bAvg(baseline.map(r => r.hartslag_rust))
  const avgHRV  = bAvg(baseline.map(r => r.hrv_rmssd))
  const avgResp = bAvg(baseline.map(r => r.ademhalingsfrequentie))

  const signals: string[] = []
  if (today.hartslag_rust && avgRHR && today.hartslag_rust > avgRHR + 6)
    signals.push(`RHR +${Math.round(today.hartslag_rust - avgRHR)} bpm`)
  if (today.hrv_rmssd && avgHRV && today.hrv_rmssd < avgHRV * 0.80)
    signals.push(`HRV –${Math.round((1 - today.hrv_rmssd / avgHRV) * 100)}%`)
  if (today.spo2 !== null && today.spo2 < 95)
    signals.push(`SpO₂ ${today.spo2}%`)
  if (today.ademhalingsfrequentie && avgResp && today.ademhalingsfrequentie > avgResp + 2)
    signals.push(`resp +${Math.round(today.ademhalingsfrequentie - avgResp)}/min`)

  return signals.length >= 2 ? { reason: signals.join(' · ') } : null
}

// RHR elevation detection — returns true if RHR is elevated vs baseline
export function computeRHRElevated(rows: HealthRow[]): {
  elevated: boolean
  rhr: number | null
  baseline: number | null
  elevation: number | null
} {
  if (rows.length < 4) return { elevated: false, rhr: null, baseline: null, elevation: null }
  const today = rows[0]
  const baseline = rows.slice(1, Math.min(8, rows.length))

  const avgRHR = baseline
    .map(r => r.hartslag_rust)
    .filter((v): v is number => v !== null)
  const rhrAvg = avgRHR.length >= 2 ? avgRHR.reduce((a, b) => a + b, 0) / avgRHR.length : null

  const todayRHR = today.hartslag_rust
  const elevation = todayRHR && rhrAvg ? todayRHR - rhrAvg : null

  return {
    elevated: elevation !== null && elevation > 5,
    rhr: todayRHR,
    baseline: rhrAvg ? Math.round(rhrAvg) : null,
    elevation: elevation ? Math.round(elevation) : null,
  }
}
