import { createServerSupabaseClient } from '@/lib/supabase-server'
import { rateLimit, readJsonLimited, rejectCrossOrigin } from '@/lib/server-security'
import { NextRequest, NextResponse } from 'next/server'

type FeedbackPayload = {
  user_id?: unknown
  workout_date?: unknown
  workout_type?: unknown
  workout_id?: unknown
  feedback_level?: unknown
  coach_advice?: unknown
  timestamp?: unknown
}

export async function POST(request: NextRequest) {
  try {
    const crossOrigin = rejectCrossOrigin(request)
    if (crossOrigin) return crossOrigin

    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const limited = rateLimit(`session-feedback:${user.id}`, 30, 60_000)
    if (limited) return limited

    const body = await readJsonLimited<FeedbackPayload>(request, 16_000)
    if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const {
      user_id,
      workout_date,
      workout_type,
      workout_id,
      feedback_level,
      coach_advice,
      timestamp,
    } = body

    // Validate user ownership
    if (user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    if (
      typeof workout_date !== 'string'
      || typeof workout_type !== 'string'
      || (workout_id !== undefined && workout_id !== null && typeof workout_id !== 'string')
      || typeof feedback_level !== 'string'
      || !['too_easy', 'just_right', 'too_hard'].includes(feedback_level)
      || (coach_advice !== undefined && coach_advice !== null && typeof coach_advice !== 'string')
      || (timestamp !== undefined && timestamp !== null && typeof timestamp !== 'string')
    ) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Insert into session_feedback table
    const { error } = await supabase.from('session_feedback').insert({
      user_id,
      workout_date,
      workout_type,
      workout_id,
      feedback_level,
      coach_advice: coach_advice || null,
      created_at: timestamp,
    })

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json(
        { error: 'Could not save feedback' },
        { status: 400 }
      )
    }

    // Link the rating back to the matching coach_override so the learning engine
    // can use the user's own difficulty signal (best-effort, never blocks).
    if (feedback_level && workout_date && workout_type) {
      const { error: linkError } = await supabase
        .from('coach_overrides')
        .update({ session_feedback: feedback_level })
        .eq('user_id', user.id)
        .eq('date', workout_date)
        .eq('sport_type', workout_type)
      if (linkError) console.warn('coach_overrides link skipped:', linkError.message)
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
