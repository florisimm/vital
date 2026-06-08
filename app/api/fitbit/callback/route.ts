import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const userId = searchParams.get('state')
  const oauthError = searchParams.get('error')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  if (oauthError || !code || !userId) {
    return NextResponse.redirect(`${siteUrl}/health?fitbit=error`)
  }

  const clientId = process.env.FITBIT_CLIENT_ID!
  const clientSecret = process.env.FITBIT_CLIENT_SECRET!

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: `${siteUrl}/api/fitbit/callback`,
      code,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${siteUrl}/health?fitbit=error`)
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json()

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== userId) {
    return NextResponse.redirect(`${siteUrl}/health?fitbit=error`)
  }

  await supabase.from('fitbit_tokens').upsert({
    user_id: userId,
    access_token,
    refresh_token,
    expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
    fitbit_user_id: 'google',
  })

  return NextResponse.redirect(`${siteUrl}/health?fitbit=connected`)
}
