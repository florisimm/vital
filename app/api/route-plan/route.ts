import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ORS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ORS API key not configured' }, { status: 500 })

  const { profile, body } = await req.json()

  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': apiKey },
      body: JSON.stringify(body),
    }
  )

  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data.error?.message ?? `ORS ${res.status}` }, { status: res.status })
  return NextResponse.json(data)
}
