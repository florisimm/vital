'use client'

import { createClient } from '@/lib/supabase'

export type Services = { strava: boolean; hevy: boolean; google: boolean; fitbit: boolean }

// Which external data sources are connected for the current user. Cached under
// the SWR key 'profile-services' so the profile panel and the Today setup
// checklist share one fetch.
export async function fetchServices(): Promise<Services> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { strava: false, hevy: false, google: false, fitbit: false }
  const [strava, hevy, google, fitbit] = await Promise.all([
    supabase.from('strava_tokens').select('id').eq('user_id', user.id).limit(1),
    supabase.from('hevy_workouts').select('id').eq('user_id', user.id).limit(1),
    supabase.from('google_tokens').select('user_id').eq('user_id', user.id).limit(1),
    supabase.from('fitbit_tokens').select('user_id').eq('user_id', user.id).limit(1),
  ])
  return {
    strava: (strava.data?.length ?? 0) > 0,
    hevy:   (hevy.data?.length   ?? 0) > 0,
    google: (google.data?.length ?? 0) > 0,
    fitbit: (fitbit.data?.length ?? 0) > 0,
  }
}

// Deep-link into the Devices & Apps section of the profile panel from anywhere.
export function openDevices() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kern:open-devices'))
}
