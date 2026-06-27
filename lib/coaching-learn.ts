// Coaching learning system with sport-specific pattern analysis.
//
// Learns from what the user actually does vs what the coach advised, and — the
// always-on signal — how well they recovered afterward (HRV/RHR rebound). When
// the user repeatedly trains through "rest" advice and bounces back fine, the
// coach is too conservative for that sport and we nudge it to push more. When
// they recover poorly, we keep it cautious. Self-reported session feedback, when
// present, refines the same signal.

import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HealthRow } from '@/lib/readiness'

export type SportType = 'running' | 'cycling' | 'strength' | 'swimming'
export type FeedbackLevel = 'easier' | 'about_right' | 'hard' | 'very_hard'

export interface CoachingAdjustment {
  sport_type: SportType
  bias_adjustment: number // -0.10 to +0.10
  conservativeness_adjustment: number // -0.10 to +0.10
  confidence: 'low' | 'medium' | 'high'
  confidence_reason: string
  reason: string
  data_points_count: number
  override_count_matching_feedback: number
  behavior_consistency_pct: number // 0-100
}

/**
 * Analyzes patterns PER SPORT from the last 90 days of coach_overrides.
 *
 * REST overrides (user trained when rest/easy was advised) are judged by a
 * combined verdict per override:
 *   1. self-reported feedback, if the user logged it
 *      ('easier'/'about_right' = handled well, 'hard'/'very_hard' = too much)
 *   2. otherwise the recovery OUTCOME from `gezondheid` — did HRV/RHR rebound to
 *      baseline within ~48h?
 * 60%+ "handled well" over 5+ judged overrides → coach too conservative (+bias).
 * 60%+ "too much" → coach was right, stay cautious (-bias).
 *
 * SAFETY LIMITS:
 * - Bias capped at ±0.10 (prevents extreme drift)
 * - Requires 60%+ consistency over MINIMUM_DATA_POINTS judged overrides
 */

const MINIMUM_DATA_POINTS = 5
const CONSISTENCY_HIGH = 0.8 // 80% consistency = high confidence
const CONSISTENCY_MEDIUM = 0.6 // 60% consistency = medium confidence
const MAX_BIAS_ADJUSTMENT = 0.1 // Safety limit: ±10%
const ANALYSIS_WINDOW_DAYS = 90

type AnalyzeOpts = { client?: SupabaseClient; healthRows?: HealthRow[] }

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function mean(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}

/**
 * Recovery outcome in the 1–2 days after an override date, from HRV/RHR rebound.
 * 'good'  = HRV back near/above baseline (and RHR not elevated)
 * 'poor'  = HRV still clearly suppressed
 * 'unknown' = not enough data / inconclusive
 */
function classifyRecovery(
  date: string,
  healthRows: HealthRow[],
  hrvBaseline: number | null,
  rhrBaseline: number | null
): 'good' | 'poor' | 'unknown' {
  const after = [1, 2]
    .map((n) => healthRows.find((r) => r.datum === addDays(date, n)))
    .filter((r): r is HealthRow => !!r)
  if (after.length === 0) return 'unknown'

  const hrvs = after.map((r) => r.hrv_rmssd).filter((v): v is number => v != null)
  const rhrs = after.map((r) => r.hartslag_rust).filter((v): v is number => v != null)

  if (hrvBaseline != null && hrvs.length) {
    const bestHrv = Math.max(...hrvs)
    const rhrOk = rhrBaseline == null || rhrs.length === 0 || Math.min(...rhrs) <= rhrBaseline * 1.05
    if (bestHrv >= hrvBaseline * 0.97 && rhrOk) return 'good'
    if (bestHrv < hrvBaseline * 0.9) return 'poor'
    return 'unknown'
  }

  // No HRV baseline — fall back to resting heart rate only
  if (rhrBaseline != null && rhrs.length) {
    const minRhr = Math.min(...rhrs)
    if (minRhr <= rhrBaseline * 1.02) return 'good'
    if (minRhr > rhrBaseline * 1.08) return 'poor'
  }
  return 'unknown'
}

export async function analyzeCoachingPatterns(
  userId: string,
  sportType?: SportType,
  opts?: AnalyzeOpts
): Promise<CoachingAdjustment | null> {
  const supabase = opts?.client ?? (await createServerSupabaseClient())
  const healthRows = opts?.healthRows ?? []

  const analysisStart = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10)

  const query = supabase
    .from('coach_overrides')
    .select('sport_type, coach_advice, user_action, session_feedback, date')
    .eq('user_id', userId)
    .gte('date', analysisStart)
    .order('date', { ascending: false })

  if (sportType) query.eq('sport_type', sportType)

  const { data: overrides, error } = await query

  if (error || !overrides || overrides.length < MINIMUM_DATA_POINTS) {
    return null
  }

  // Baselines for recovery classification (whole window)
  const hrvBaseline = mean(healthRows.map((r) => r.hrv_rmssd).filter((v): v is number => v != null))
  const rhrBaseline = mean(
    healthRows.map((r) => r.hartslag_rust).filter((v): v is number => v != null)
  )

  // ── REST overrides: feedback first, recovery outcome as the always-on signal ──
  const restOverrides = overrides.filter((o) => {
    // Only count days the user actually trained against the advice — adherence
    // rows (rested as advised) must never inflate the "handled well" signal.
    if (o.user_action && o.user_action !== 'trained') return false
    const advice = (o.coach_advice ?? '').toLowerCase()
    return advice.includes('rest') || advice.includes('easy') || advice.includes('mobility')
  })

  if (restOverrides.length >= MINIMUM_DATA_POINTS) {
    let good = 0
    let poor = 0
    let fromFeedback = 0
    let fromOutcome = 0

    for (const o of restOverrides) {
      const fb = o.session_feedback as FeedbackLevel | null
      if (fb === 'easier' || fb === 'about_right') {
        good++
        fromFeedback++
        continue
      }
      if (fb === 'hard' || fb === 'very_hard') {
        poor++
        fromFeedback++
        continue
      }
      const rec = classifyRecovery(o.date, healthRows, hrvBaseline, rhrBaseline)
      if (rec === 'good') {
        good++
        fromOutcome++
      } else if (rec === 'poor') {
        poor++
        fromOutcome++
      }
    }

    const known = good + poor
    if (known >= MINIMUM_DATA_POINTS) {
      const goodConsistency = good / known
      const poorConsistency = poor / known
      const signalNote =
        fromOutcome > 0
          ? `${fromOutcome} from recovery, ${fromFeedback} from your feedback`
          : `${fromFeedback} from your feedback`

      if (goodConsistency >= CONSISTENCY_MEDIUM) {
        const confidence = goodConsistency >= CONSISTENCY_HIGH ? 'high' : 'medium'
        return {
          sport_type: sportType || ('running' as SportType),
          bias_adjustment: 0.05, // can push a little more
          conservativeness_adjustment: -0.05,
          confidence,
          confidence_reason: `${Math.round(goodConsistency * 100)}% good recovery over ${known} overrides (${signalNote})`,
          reason: `${sportType || 'Global'}: trained through Rest advice and recovered well ${good}/${known} times → can push a bit more`,
          data_points_count: known,
          override_count_matching_feedback: good,
          behavior_consistency_pct: Math.round(goodConsistency * 100),
        }
      }

      if (poorConsistency >= CONSISTENCY_MEDIUM) {
        const confidence = poorConsistency >= CONSISTENCY_HIGH ? 'high' : 'medium'
        return {
          sport_type: sportType || ('running' as SportType),
          bias_adjustment: -0.05, // stay cautious
          conservativeness_adjustment: 0.05,
          confidence,
          confidence_reason: `${Math.round(poorConsistency * 100)}% poor recovery over ${known} overrides (${signalNote})`,
          reason: `${sportType || 'Global'}: trained through Rest advice but recovered poorly ${poor}/${known} times → stay conservative`,
          data_points_count: known,
          override_count_matching_feedback: poor,
          behavior_consistency_pct: Math.round(poorConsistency * 100),
        }
      }
    }
  }

  // ── HARD overrides: user reports intense sessions as harder than advised ──
  const hardOverrides = overrides.filter((o) => {
    const advice = (o.coach_advice ?? '').toLowerCase()
    return (
      advice.includes('hard') ||
      advice.includes('threshold') ||
      advice.includes('tempo') ||
      advice.includes('interval') ||
      advice.includes('vo2')
    )
  })

  if (hardOverrides.length >= MINIMUM_DATA_POINTS) {
    const hardVeryHardFeedback = hardOverrides.filter((o) => o.session_feedback === 'very_hard').length
    const consistency = hardVeryHardFeedback / hardOverrides.length

    if (consistency >= CONSISTENCY_MEDIUM) {
      const confidence = consistency >= CONSISTENCY_HIGH ? 'high' : 'medium'
      return {
        sport_type: sportType || ('cycling' as SportType),
        bias_adjustment: -0.05,
        conservativeness_adjustment: 0.05,
        confidence,
        confidence_reason: `User reports Very Hard for ${Math.round(consistency * 100)}% of intense workouts over ${hardOverrides.length} instances`,
        reason: `${sportType || 'Global'}: reports Very Hard for ${hardVeryHardFeedback}/${hardOverrides.length} intense workouts → stay conservative`,
        data_points_count: hardVeryHardFeedback,
        override_count_matching_feedback: hardVeryHardFeedback,
        behavior_consistency_pct: Math.round(consistency * 100),
      }
    }
  }

  return null // No clear pattern detected
}

/**
 * Gets the effective bias multiplier for readiness adjustment.
 * Returns 1.0 = no adjustment, 0.95 = 5% lower, 1.05 = 5% higher
 */
export async function getCoachBiasMultiplier(
  userId: string,
  sportType: SportType,
  client?: SupabaseClient
): Promise<number> {
  const supabase = client ?? (await createServerSupabaseClient())

  const { data, error } = await supabase
    .from('coach_bias_adjustments')
    .select('bias_adjustment')
    .eq('user_id', userId)
    .eq('sport_type', sportType)
    .single()

  if (error || !data || data.bias_adjustment == null) {
    return 1.0 // No adjustment
  }

  const adjustment = parseFloat(data.bias_adjustment as any)
  const bounded = Math.max(-MAX_BIAS_ADJUSTMENT, Math.min(MAX_BIAS_ADJUSTMENT, adjustment))
  return 1.0 + bounded
}

/**
 * Stores the calculated adjustment. Ensures bias never exceeds ±10% and skips
 * low-confidence noise.
 */
export async function storeCoachingAdjustment(
  userId: string,
  adjustment: CoachingAdjustment,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? (await createServerSupabaseClient())

  const safeBias = Math.max(-MAX_BIAS_ADJUSTMENT, Math.min(MAX_BIAS_ADJUSTMENT, adjustment.bias_adjustment))
  const safeConserv = Math.max(
    -MAX_BIAS_ADJUSTMENT,
    Math.min(MAX_BIAS_ADJUSTMENT, adjustment.conservativeness_adjustment)
  )

  // Don't store low-confidence noise (avoid thrashing)
  if (adjustment.confidence === 'low' && adjustment.behavior_consistency_pct < 60) {
    console.info(
      `Skipping adjustment for ${adjustment.sport_type}: consistency too low (${adjustment.behavior_consistency_pct}%)`
    )
    return
  }

  const { error } = await supabase.from('coach_bias_adjustments').upsert(
    {
      user_id: userId,
      sport_type: adjustment.sport_type,
      bias_adjustment: safeBias.toString(),
      conservativeness_adjustment: safeConserv.toString(),
      confidence: adjustment.confidence,
      confidence_reason: adjustment.confidence_reason,
      reason: adjustment.reason,
      data_points_count: adjustment.data_points_count,
      override_count_matching_feedback: adjustment.override_count_matching_feedback,
      behavior_consistency_pct: adjustment.behavior_consistency_pct,
      calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,sport_type' }
  )

  if (error) {
    console.error('Failed to store coaching adjustment:', error)
    throw error
  }
}

/**
 * Gets all adjustments for a user (across all sports they have data for)
 */
export async function getUserCoachingAdjustments(
  userId: string,
  client?: SupabaseClient
): Promise<CoachingAdjustment[]> {
  const supabase = client ?? (await createServerSupabaseClient())

  const { data, error } = await supabase
    .from('coach_bias_adjustments')
    .select(
      'sport_type,bias_adjustment,conservativeness_adjustment,confidence,confidence_reason,reason,data_points_count,override_count_matching_feedback,behavior_consistency_pct'
    )
    .eq('user_id', userId)

  if (error || !data) return []

  return data.map((row: any) => ({
    sport_type: row.sport_type as SportType,
    bias_adjustment: parseFloat(row.bias_adjustment) || 0,
    conservativeness_adjustment: parseFloat(row.conservativeness_adjustment) || 0,
    confidence: row.confidence as 'low' | 'medium' | 'high',
    confidence_reason: row.confidence_reason || '',
    reason: row.reason || '',
    data_points_count: row.data_points_count || 0,
    override_count_matching_feedback: row.override_count_matching_feedback || 0,
    behavior_consistency_pct: row.behavior_consistency_pct || 0,
  }))
}
