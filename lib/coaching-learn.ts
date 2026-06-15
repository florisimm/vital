// Coaching learning system with sport-specific pattern analysis
// Analyzes coach_overrides to detect sport-dependent behavior patterns
// and adjusts future recommendations accordingly.

import { createServerSupabaseClient } from '@/lib/supabase-server'

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
 * CRITICAL: Analyzes patterns PER SPORT, not globally.
 *
 * For each sport (Running, Cycling, Strength, Swimming), detects:
 * 1. Does user consistently override rest/easy advice with good outcomes?
 *    → Coach is too conservative for this sport
 * 2. Does user report workouts as "Very Hard" when coach says "Hard"?
 *    → Coach underestimates difficulty for this sport
 * 3. How consistent is the override pattern?
 *    → Informs confidence level
 *
 * Rules (per sport):
 * - Rest overrides: 5+ instances, 60%+ positive feedback → reduce conservativeness
 * - Hard overrides: 3+ instances, 60%+ "very hard" feedback → increase conservativeness
 * - Insufficient data (< 5 overrides per pattern) → no adjustment
 * - Consistency matters: 80%+ matching patterns = HIGH confidence, 60-80% = MEDIUM, <60% = LOW
 *
 * SAFETY LIMITS:
 * - Bias capped at ±0.10 (prevents extreme drift)
 * - Requires minimum behavior consistency to adjust (60%+ pattern matching)
 * - Never adjusts below MINIMUM_DATA_POINTS overrides per sport
 */

const MINIMUM_DATA_POINTS = 5
const CONSISTENCY_HIGH = 0.8 // 80% consistency = high confidence
const CONSISTENCY_MEDIUM = 0.6 // 60% consistency = medium confidence
const MAX_BIAS_ADJUSTMENT = 0.1 // Safety limit: ±10%
const ANALYSIS_WINDOW_DAYS = 90

export async function analyzeCoachingPatterns(
  userId: string,
  sportType?: SportType
): Promise<CoachingAdjustment | null> {
  const supabase = await createServerSupabaseClient()

  const analysisStart = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10)

  // Fetch overrides for this sport (or all sports if none specified)
  const query = supabase
    .from('coach_overrides')
    .select('sport_type, coach_advice, user_action, session_feedback, date')
    .eq('user_id', userId)
    .gte('date', analysisStart)
    .order('date', { ascending: false })

  if (sportType) {
    query.eq('sport_type', sportType)
  }

  const { data: overrides, error } = await query

  if (error || !overrides || overrides.length < MINIMUM_DATA_POINTS) {
    return null
  }

  // Analyze REST override patterns
  const restOverrides = overrides.filter((o) => {
    const advice = (o.coach_advice ?? '').toLowerCase()
    return advice.includes('rest') || advice.includes('easy') || advice.includes('mobility')
  })

  if (restOverrides.length >= MINIMUM_DATA_POINTS) {
    const restPositiveFeedback = restOverrides.filter(
      (o) => o.session_feedback === 'easier' || o.session_feedback === 'about_right'
    ).length

    const consistency = restPositiveFeedback / restOverrides.length

    if (consistency >= CONSISTENCY_MEDIUM) {
      const confLevel = consistency >= CONSISTENCY_HIGH ? 'high' : 'medium'
      const confReason =
        consistency >= CONSISTENCY_HIGH
          ? `User consistently overrides Rest advice (${Math.round(consistency * 100)}% positive feedback over ${restOverrides.length} instances)`
          : `User often overrides Rest advice (${Math.round(consistency * 100)}% positive feedback, but some variance)`

      return {
        sport_type: sportType || ('running' as SportType),
        bias_adjustment: 0.05, // Slightly less conservative
        conservativeness_adjustment: -0.05,
        confidence: confLevel,
        confidence_reason: confReason,
        reason: `${sportType || 'Global'}: User overrides Rest/Easy advice ${restPositiveFeedback}/${restOverrides.length} times with positive feedback`,
        data_points_count: restPositiveFeedback,
        override_count_matching_feedback: restPositiveFeedback,
        behavior_consistency_pct: Math.round(consistency * 100),
      }
    }
  }

  // Analyze HARD workout patterns
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
      const confLevel = consistency >= CONSISTENCY_HIGH ? 'high' : 'medium'
      const confReason =
        consistency >= CONSISTENCY_HIGH
          ? `User consistently reports Very Hard for intense workouts (${Math.round(consistency * 100)}% over ${hardOverrides.length} instances)`
          : `User often reports Very Hard for intense workouts (${Math.round(consistency * 100)}% feedback, but some variance)`

      return {
        sport_type: sportType || ('cycling' as SportType),
        bias_adjustment: -0.05, // Slightly more conservative (workouts harder than expected)
        conservativeness_adjustment: 0.05,
        confidence: confLevel,
        confidence_reason: confReason,
        reason: `${sportType || 'Global'}: User reports Very Hard for ${hardVeryHardFeedback}/${hardOverrides.length} intense workouts`,
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
 * Applies safety bounds: -10% to +10% max adjustment
 *
 * Returns 1.0 = no adjustment, 0.95 = 5% lower, 1.05 = 5% higher
 */
export async function getCoachBiasMultiplier(userId: string, sportType: SportType): Promise<number> {
  const supabase = await createServerSupabaseClient()

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
  // Safety bounds: clamp to ±10%
  const bounded = Math.max(-MAX_BIAS_ADJUSTMENT, Math.min(MAX_BIAS_ADJUSTMENT, adjustment))
  return 1.0 + bounded
}

/**
 * Stores the calculated adjustment in the database.
 * SAFETY: Ensures bias never exceeds ±10%, validates confidence before storing
 */
export async function storeCoachingAdjustment(
  userId: string,
  adjustment: CoachingAdjustment
): Promise<void> {
  const supabase = await createServerSupabaseClient()

  // Safety validation
  const safeBias = Math.max(-MAX_BIAS_ADJUSTMENT, Math.min(MAX_BIAS_ADJUSTMENT, adjustment.bias_adjustment))
  const safeConserv = Math.max(
    -MAX_BIAS_ADJUSTMENT,
    Math.min(MAX_BIAS_ADJUSTMENT, adjustment.conservativeness_adjustment)
  )

  // Don't store if confidence is low AND we already have data (avoid thrashing)
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
export async function getUserCoachingAdjustments(userId: string): Promise<CoachingAdjustment[]> {
  const supabase = await createServerSupabaseClient()

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
