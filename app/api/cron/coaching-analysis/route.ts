/**
 * POST /api/cron/coaching-analysis
 *
 * Periodic job (runs daily/weekly via cron) that:
 * 1. Fetches all users with recent coaching overrides
 * 2. For each user, analyzes patterns PER SPORT
 * 3. Updates coach_bias_adjustments table with learned adjustments
 *
 * SECURITY: Verifies CRON_SECRET from environment before running
 *
 * Example cron trigger (Vercel):
 * POST https://vital-bay-theta.vercel.app/api/cron/coaching-analysis
 * Header: Authorization: Bearer ${CRON_SECRET}
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  analyzeCoachingPatterns,
  storeCoachingAdjustment,
  type SportType,
} from '@/lib/coaching-learn'

const SPORTS: SportType[] = ['running', 'cycling', 'strength', 'swimming']

export async function POST(request: NextRequest) {
  try {
    // Verify CRON_SECRET from Authorization header
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')

    if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.warn('Unauthorized cron request (missing/invalid CRON_SECRET)')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.info('[Coaching Analysis] Starting periodic analysis job')

    // Use service role key so RLS does not filter out other users' data
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
    }
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    // Get all unique users with recent overrides (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000)
      .toISOString()
      .slice(0, 10)

    const { data: recentOverrides, error: fetchError } = await supabase
      .from('coach_overrides')
      .select('user_id, sport_type')
      .gte('date', ninetyDaysAgo)

    if (fetchError) {
      console.error('Failed to fetch coach_overrides:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch data', details: fetchError.message },
        { status: 500 }
      )
    }

    if (!recentOverrides || recentOverrides.length === 0) {
      return NextResponse.json(
        { success: true, analyzed: 0, message: 'No recent overrides found' },
        { status: 200 }
      )
    }

    // Group by user_id to avoid duplicate processing
    const userIds = [...new Set(recentOverrides.map((r) => r.user_id))]
    console.info(`[Coaching Analysis] Found ${userIds.length} users with recent overrides`)

    let totalAnalyzed = 0
    let totalAdjustments = 0

    // Health window for recovery-outcome classification
    const healthStart = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)

    // For each user, analyze all sports
    for (const userId of userIds) {
      // Fetch this user's recent health once (service role bypasses RLS)
      const { data: healthRows } = await supabase
        .from('gezondheid')
        .select(
          'datum,hartslag_rust,hrv_rmssd,slaap_minuten,slaap_score,slaap_diep,slaap_rem,slaap_licht,wakker_minuten,wakker_count,spo2,ademhalingsfrequentie'
        )
        .eq('user_id', userId)
        .gte('datum', healthStart)
        .order('datum', { ascending: false })

      for (const sport of SPORTS) {
        try {
          // Analyze this user's pattern for this sport
          const adjustment = await analyzeCoachingPatterns(userId, sport, {
            client: supabase,
            healthRows: (healthRows ?? []) as any,
          })

          if (adjustment) {
            // Store the adjustment
            await storeCoachingAdjustment(userId, adjustment, supabase)
            totalAdjustments++
            console.info(
              `[Coaching Analysis] Updated: ${userId} / ${sport} (confidence: ${adjustment.confidence})`
            )
          }

          totalAnalyzed++
        } catch (err) {
          console.error(
            `[Coaching Analysis] Error analyzing ${userId}/${sport}:`,
            err instanceof Error ? err.message : String(err)
          )
          // Continue to next sport/user on error
        }
      }
    }

    console.info(
      `[Coaching Analysis] Complete: analyzed ${totalAnalyzed} patterns, stored ${totalAdjustments} adjustments`
    )

    return NextResponse.json(
      {
        success: true,
        users_analyzed: userIds.length,
        patterns_analyzed: totalAnalyzed,
        adjustments_stored: totalAdjustments,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('[Coaching Analysis] Unexpected error:', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
