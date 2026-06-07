import { NextRequest, NextResponse } from 'next/server'

const SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
].join(' ')

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

  const clientId = process.env.FITBIT_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'Not configured' }, { status: 500 })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: `${siteUrl}/api/fitbit/callback`,
    state: userId,
    access_type: 'offline',
    prompt: 'consent',
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
