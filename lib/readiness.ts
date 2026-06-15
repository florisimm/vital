// Shared physiology / readiness utilities — single source of truth used by
// Health and Training tabs so both show the same numbers.

import { localDateStr } from './timeFormat'

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

// Physiology readiness: Sleep 50% + HRV vs baseline 30% + RHR vs baseline 20%
// HRV and RHR use personal 30-day baseline when ≥4 historical readings are available;
// otherwise falls back to absolute scoring. Each metric degrades gracefully if absent.
export function computePhysiologyReadiness(rows: HealthRow[]): {
  score: number | null
  label: string
  color: string
  explanation: string
} {
  const noData = { score: null, label: '–', color: 'rgba(255,255,255,0.3)', explanation: '' }

  // "Last night" metrics are stored under today's (wake-up) datum. If today has
  // no data (Fitbit not worn), each component is null and readiness degrades —
  // we never fall back to a stale earlier night.
  const todayStr = localDateStr()
  const todayRow = rows.find(r => r.datum === todayStr) ?? null

  // Sleep (0–1) — use last night if available, otherwise 7-day average as fallback
  const sleepRows = rows.filter(r => r.slaap_minuten != null)
  const storedOrComputed = (r: HealthRow) => r.slaap_score ?? computeSleepScore(r)
  const sleepScore = todayRow?.slaap_minuten != null
    ? storedOrComputed(todayRow)
    : sleepRows.length >= 2
      ? Math.round(sleepRows.slice(0, 7).reduce((s, r) => s + (storedOrComputed(r) ?? 0), 0) / Math.min(sleepRows.length, 7))
      : null
  const sleepComponent = sleepScore != null ? sleepScore / 100 : null
  const sleepIsFallback = todayRow?.slaap_minuten == null && sleepScore != null

  // HRV — baseline-relative when ≥4 historical readings, absolute fallback
  const hrvRows = rows.filter(r => r.hrv_rmssd != null)
  const todayHRV = todayRow?.hrv_rmssd ?? null
  let hrvComponent: number | null = null
  let hrvDevPct: number | null = null
  if (todayHRV != null) {
    const hist = hrvRows.slice(1, 31).map(r => r.hrv_rmssd as number)
    if (hist.length >= 4) {
      const baseline = hist.reduce((a, b) => a + b, 0) / hist.length
      hrvDevPct = Math.round(((todayHRV - baseline) / baseline) * 100)
      // ±30% deviation spans [0, 1]; at baseline = 0.5
      hrvComponent = Math.max(0, Math.min(1, 0.5 + (todayHRV - baseline) / baseline / 0.6))
    } else {
      hrvComponent = todayHRV / (todayHRV + 50)
    }
  }

  // RHR — baseline-relative when ≥4 historical readings, absolute fallback
  const rhrRows = rows.filter(r => r.hartslag_rust != null)
  const todayRHR = todayRow?.hartslag_rust ?? null
  let rhrComponent: number | null = null
  let rhrDevPct: number | null = null
  if (todayRHR != null) {
    const hist = rhrRows.slice(1, 31).map(r => r.hartslag_rust as number)
    if (hist.length >= 4) {
      const baseline = hist.reduce((a, b) => a + b, 0) / hist.length
      rhrDevPct = Math.round(((todayRHR - baseline) / baseline) * 100)
      // Higher than baseline = worse; ±15% spans [0, 1]; at baseline = 0.5
      rhrComponent = Math.max(0, Math.min(1, 0.5 - (todayRHR - baseline) / baseline / 0.3))
    } else {
      rhrComponent = Math.max(0, Math.min(1, (100 - todayRHR) / 50))
    }
  }

  // Graceful degradation — redistribute weights proportionally over available metrics
  const metrics: Array<[number | null, number, string]> = [
    [sleepComponent, 50, 'sleep'],
    [hrvComponent,   30, 'hrv'],
    [rhrComponent,   20, 'rhr'],
  ]
  const available = metrics.filter(([v]) => v != null) as Array<[number, number, string]>
  if (available.length === 0) return noData

  const totalWeight = available.reduce((s, [, w]) => s + w, 0)
  const score = Math.round(available.reduce((s, [v, w]) => s + v * w, 0) / totalWeight * 100)

  // Dynamic explanation — find the metric with the biggest shortfall
  const deficits = available.map(([v, w, name]) => ({ name, deficit: w * (1 - v), v }))
  deficits.sort((a, b) => b.deficit - a.deficit)
  const top = deficits[0]
  let explanation = ''
  if (top.name === 'hrv') {
    if (hrvDevPct !== null && hrvDevPct < -10)
      explanation = `Readiness is primarily reduced by lower HRV than normal (${hrvDevPct}% below your baseline).`
    else if (hrvDevPct !== null && hrvDevPct > 10)
      explanation = `HRV is above your usual level (+${hrvDevPct}%) — good sign for recovery.`
  } else if (top.name === 'rhr') {
    if (rhrDevPct !== null && rhrDevPct > 8)
      explanation = `Resting heart rate is higher than normal (+${rhrDevPct}%) — indicates reduced recovery.`
    else if (rhrDevPct !== null && rhrDevPct < -8)
      explanation = `Resting heart rate is lower than normal — good sign for recovery.`
  } else if (top.name === 'sleep') {
    if (sleepIsFallback)
      explanation = 'No sleep data from last night — readiness is based on your average from recent days.'
    else if (top.v < 0.55)
      explanation = 'Sleep quality is the main factor in your lower readiness today.'
    else if (top.v > 0.80)
      explanation = 'Sleep quality is above your usual level.'
  }

  const label = score >= 80 ? 'Peak'
    : score >= 65 ? 'Good'
    : score >= 50 ? 'Moderate'
    : 'Low'

  const color = score >= 80 ? '#4ade80'
    : score >= 65 ? '#2dd4bf'
    : score >= 50 ? '#fb923c'
    : '#f87171'

  return { score, label, color, explanation }
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
