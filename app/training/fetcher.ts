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
  const now = new Date()
  const todayDate = now.toISOString().split('T')[0]

  const [{ data: activities }, { data: hevy }, { data: calendarEvents, error: calendarError }, { data: settings }] = await Promise.all([
    supabase
      .from('strava_activities')
      .select('id,name,sport_type,start_date,distance,moving_time,elapsed_time,total_elevation_gain,average_speed,average_heartrate,average_cadence,kilojoules')
      .eq('user_id', user.id).gte('start_date', thirtyDaysAgo).order('start_date', { ascending: false }),
    supabase
      .from('hevy_workouts')
      .select('id,title,start_time,end_time,duration,volume_kg,sets,exercises')
      .eq('user_id', user.id).gte('start_time', thirtyDaysAgo).order('start_time', { ascending: false }),
    supabase
      .from('calendar_events')
      .select('id,title,start_date,start_datetime,end_datetime')
      .eq('user_id', user.id).gte('start_date', todayDate).order('start_date', { ascending: true }),
    supabase
      .from('user_settings')
      .select('training_frequencies')
      .eq('user_id', user.id)
      .single()
  ])

  if (calendarError) console.error('Calendar fetch error:', calendarError)

  const sportKeywords = ['gym', 'run', 'loop', 'ride', 'fietsen', 'zwemmen', 'swim', 'voetbal', 'tennis', 'volleybal', 'training', 'workout', 'strength', 'push', 'pull', 'squat', 'toernooi', 'duurloop', 'interval', 'zone', 'sport', 'sporten', 'hardlopen', 'wielren', 'crossfit', 'kracht', 'fitness', 'gewichten', 'deadlift', 'bench', 'upper', 'lower', 'legs']

  const filteredCalendarEvents = (calendarEvents ?? []).filter((e: any) => {
    // Compare exact time if available, otherwise just date
    const eventTime = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date)
    if (eventTime < now) return false
    return sportKeywords.some(kw => e.title.toLowerCase().includes(kw))
  })

  const trainingFrequencies: Record<string, number> = (settings as any)?.training_frequencies ?? {}

  return {
    activities: (activities ?? []) as Activity[],
    hevy: (hevy ?? []) as HevyWorkout[],
    calendarEvents: filteredCalendarEvents,
    trainingFrequencies,
  }
}
