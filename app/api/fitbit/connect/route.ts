import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
].join(' ')

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestedUserId = req.nextUrl.searchParams.get('user_id')
  if (requestedUserId && requestedUserId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'Not configured' }, { status: 500 })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const state = crypto.randomUUID()

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    scope:         SCOPES,
    redirect_uri:  `${siteUrl}/api/fitbit/callback`,
    state,
    access_type:   'offline',
    prompt:        'consent',
  })

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  response.cookies.set('fitbit_oauth_state', `${user.id}:${state}`, {
    httpOnly: true,
    secure: siteUrl.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  })
  return response
}
