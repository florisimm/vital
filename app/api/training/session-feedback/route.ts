import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json()
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
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
