import { createClient } from '@/lib/supabase'
import type { Activity, HevyWorkout } from './sections'

export async function trainingFetcher() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  const [{ data: activities }, { data: hevy }] = await Promise.all([
    supabase
      .from('strava_activities')
      .select('id,name,sport_type,start_date,distance,moving_time,elapsed_time,total_elevation_gain,average_speed,average_heartrate,average_cadence,kilojoules')
      .eq('user_id', user.id).gte('start_date', thirtyDaysAgo).order('start_date', { ascending: false }),
    supabase
      .from('hevy_workouts')
      .select('id,title,start_time,end_time,duration,volume_kg,sets,exercises')
      .eq('user_id', user.id).gte('start_time', thirtyDaysAgo).order('start_time', { ascending: false }),
  ])

  return { activities: (activities ?? []) as Activity[], hevy: (hevy ?? []) as HevyWorkout[] }
}
