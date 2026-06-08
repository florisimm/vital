// Shared physiology / readiness utilities — single source of truth used by
// Health and Training tabs so both show the same numbers.

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

// Physiology readiness: sleep 40% + HRV 35% + RHR 25%
// Uses the most recent row that has each metric (last night's sleep may not
// have today's RHR yet, so each metric falls back independently).
export function computePhysiologyReadiness(rows: HealthRow[]): {
  score: number | null
  label: string
  color: string
} {
  const latestWithSleep = rows.find(r => r.slaap_minuten != null) ?? null
  const latestWithHR    = rows.find(r => r.hartslag_rust  != null) ?? null
  const latestWithHRV   = rows.find(r => r.hrv_rmssd      != null) ?? null

  const hrv        = latestWithHRV?.hrv_rmssd ?? null
  const restingHR  = latestWithHR?.hartslag_rust ?? null
  const sleepScore = latestWithSleep ? computeSleepScore(latestWithSleep) : null

  if (!hrv && !restingHR && !sleepScore) return { score: null, label: '–', color: 'rgba(255,255,255,0.3)' }

  let score = 0, weight = 0
  if (hrv)        { score += (hrv / (hrv + 50)) * 35; weight += 35 }
  if (restingHR)  { score += Math.max(0, Math.min((100 - restingHR) / 50, 1)) * 25; weight += 25 }
  if (sleepScore) { score += (sleepScore / 100) * 40; weight += 40 }
  const val = weight > 0 ? Math.round((score / weight) * 100) : null

  const label = val === null ? '–'
    : val >= 80 ? 'Peak'
    : val >= 65 ? 'Good'
    : val >= 50 ? 'Moderate'
    : 'Low'

  const color = val === null ? 'rgba(255,255,255,0.3)'
    : val >= 80 ? '#4ade80'
    : val >= 65 ? '#2dd4bf'
    : val >= 50 ? '#fb923c'
    : '#f87171'

  return { score: val, label, color }
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
