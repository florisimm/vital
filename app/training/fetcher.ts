'use client'

import { createClient } from '@/lib/supabase'
import type { Activity, HevyWorkout } from './sections'

export type CalendarEvent = {
  id: string
  title: string
  start_date: string
  end_date: string | null
}

export async function trainingFetcher() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const thirtyDaysAgoDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const now = new Date()
  const todayDate = now.toISOString().split('T')[0]

  const [{ data: activities }, { data: hevy }, { data: calendarEvents, error: calendarError }, { data: settings }, { data: biasRows }] = await Promise.all([
    supabase
      .from('strava_activities')
      .select('id,name,sport_type,start_date,distance,moving_time,elapsed_time,total_elevation_gain,average_speed,average_heartrate,average_cadence,kilojoules,average_watts,weighted_average_watts')
      .eq('user_id', user.id).gte('start_date', thirtyDaysAgo).order('start_date', { ascending: false }),
    supabase
      .from('hevy_workouts')
      .select('id,title,start_time,end_time,duration,volume_kg,sets,exercises')
      .eq('user_id', user.id).gte('start_time', thirtyDaysAgo).order('start_time', { ascending: false }),
    supabase
      .from('calendar_events')
      .select('id,title,start_date,start_datetime,end_datetime')
      .eq('user_id', user.id).gte('start_date', thirtyDaysAgoDate).order('start_date', { ascending: true }),
    supabase
      .from('user_settings')
      .select('training_frequencies,training_goal,training_sport_priority,training_goal_priority,training_intensity,training_injuries,training_self_planned,age,max_hr')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('coach_bias_adjustments')
      .select('sport_type, bias_adjustment, conservativeness_adjustment, confidence')
      .eq('user_id', user.id)
  ])

  if (calendarError) console.error('Calendar fetch error:', calendarError)

  const sportKeywords = ['gym', 'run', 'loop', 'ride', 'fietsen', 'zwemmen', 'swim', 'voetbal', 'tennis', 'volleybal', 'training', 'workout', 'strength', 'push', 'pull', 'squat', 'toernooi', 'duurloop', 'interval', 'zone', 'sport', 'sporten', 'hardlopen', 'wielren', 'crossfit', 'kracht', 'fitness', 'gewichten', 'deadlift', 'bench', 'upper', 'lower', 'legs']

  const isSportEvent = (e: any) => sportKeywords.some(kw => e.title.toLowerCase().includes(kw))
  const eventTimeOf = (e: any) => e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date)

  const filteredCalendarEvents = (calendarEvents ?? []).filter((e: any) => {
    if (eventTimeOf(e) < now) return false
    return isSportEvent(e)
  })

  // Past sport events (last 30 days) — used to learn which sessions you skip
  const pastCalendarEvents = (calendarEvents ?? []).filter((e: any) => {
    if (eventTimeOf(e) >= now) return false
    return isSportEvent(e)
  })

  const trainingFrequencies: Record<string, number> = (settings as any)?.training_frequencies ?? {}
  const trainingGoal: string | null = (settings as any)?.training_goal ?? null
  const sportPriority: string[] = (settings as any)?.training_sport_priority ?? ['running', 'cycling', 'swimming', 'gym']
  const trainingIntensity: string = (settings as any)?.training_intensity ?? 'moderate'
  const goalPriority: string[] = (settings as any)?.training_goal_priority ?? []
  const injuries: Record<string, boolean> = (settings as any)?.training_injuries ?? {}
  const selfPlanned: Record<string, boolean> = (settings as any)?.training_self_planned ?? {}

  // Personalized max heart rate: explicit override wins, else Tanaka (208 − 0.7·age).
  // null → calculations fall back to the legacy absolute HR zones (HRmax ≈ 190).
  const age: number | null = (settings as any)?.age ?? null
  const maxHrOverride: number | null = (settings as any)?.max_hr ?? null
  const maxHeartRate: number | null = maxHrOverride ?? (age ? Math.round(208 - 0.7 * age) : null)

  // bias_adjustment per sport: positive = user handles more load than model thinks
  const biasBySport: Record<string, number> = {}
  for (const row of (biasRows ?? []) as any[]) {
    if (row.confidence !== 'low') biasBySport[row.sport_type] = row.bias_adjustment ?? 0
  }

  return {
    activities: (activities ?? []) as Activity[],
    hevy: (hevy ?? []) as HevyWorkout[],
    calendarEvents: filteredCalendarEvents,
    pastCalendarEvents,
    trainingFrequencies,
    trainingGoal,
    sportPriority,
    trainingIntensity,
    goalPriority,
    biasBySport,
    injuries,
    selfPlanned,
    maxHeartRate,
  }
}
