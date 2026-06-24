import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Every public table that holds per-user rows (has a user_id column). Deleted
// before removing the auth user so nothing is left orphaned.
const USER_TABLES = [
  'alarm_log', 'api_keys', 'body_measurements', 'calendar_events',
  'coach_bias_adjustments', 'coach_overrides', 'error_logs', 'fitbit_tokens',
  'food_log', 'gezondheid', 'google_calendar_tokens', 'google_tokens',
  'hevy_workouts', 'meal_templates', 'products', 'scheduled_alarms',
  'session_feedback', 'session_ratings', 'shortcut_tokens', 'strava_activities',
  'strava_tokens', 'supplements', 'training_preferences', 'user_settings',
]

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: '' }))

  // 1. Identify the logged-in user from their session cookie
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Re-verify the password before allowing destructive deletion
  if (!password) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 })
  }
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { error: pwError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password,
  })
  if (pwError) {
    return NextResponse.json({ error: 'Wachtwoord is onjuist' }, { status: 403 })
  }

  // 3. Service-role client wipes all user data and removes the auth account
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const errors: string[] = []
  for (const table of USER_TABLES) {
    const { error } = await admin.from(table).delete().eq('user_id', user.id)
    if (error) errors.push(`${table}: ${error.message}`)
  }

  const { error: delError } = await admin.auth.admin.deleteUser(user.id)
  if (delError) {
    return NextResponse.json({ error: delError.message, tableErrors: errors }, { status: 500 })
  }

  // 4. Clear the session cookies on this device
  await supabase.auth.signOut().catch(() => {})

  return NextResponse.json({ ok: true, tableErrors: errors })
}
