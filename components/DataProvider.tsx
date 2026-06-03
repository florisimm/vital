'use client'

import { useEffect } from 'react'
import { mutate } from 'swr'
import { createClient } from '@/lib/supabase'

// Prefetches all app data into the SWR cache on first render,
// so every tab has data ready before the user clicks it.
export function DataProvider() {
  useEffect(() => {
    async function prefetch() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date().toISOString().split('T')[0]
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const weekStart = (() => {
        const d = new Date(); d.setHours(0,0,0,0)
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        return d.toISOString()
      })()

      // Fire all queries in parallel
      const [
        { data: foodLog }, { data: settings }, { data: products },
        { data: weather }, { data: upcoming }, { data: gezondheid },
        { data: activities }, { data: hevy },
      ] = await Promise.all([
        supabase.from('food_log').select('id,meal_category,food_name,amount_g,kcal,protein,carbs,fat,logged_at').eq('user_id', user.id).eq('date', today).order('logged_at', { ascending: true }),
        supabase.from('user_settings').select('macro_kcal,macro_protein,macro_carbs,macro_fat').eq('user_id', user.id).single(),
        supabase.from('products').select('id,name,brand,kcal,protein,carbs,fat,servings').or(`user_id.eq.${user.id},user_id.is.null`).order('name'),
        supabase.from('weather_cache').select('*').eq('id', 'current').single(),
        supabase.from('strava_activities').select('name,sport_type,start_date,distance,moving_time').eq('user_id', user.id).gte('start_date', new Date().toISOString()).order('start_date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('gezondheid').select('datum,stappen,gewicht').eq('user_id', user.id).order('datum', { ascending: false }).limit(30),
        supabase.from('strava_activities').select('id,name,sport_type,start_date,distance,moving_time,elapsed_time,total_elevation_gain,average_speed,average_heartrate,average_cadence,kilojoules').eq('user_id', user.id).gte('start_date', thirtyDaysAgo).order('start_date', { ascending: false }),
        supabase.from('hevy_workouts').select('id,title,start_time,end_time,duration,volume_kg,sets,exercises').eq('user_id', user.id).gte('start_time', thirtyDaysAgo).order('start_time', { ascending: false }),
      ])

      // Populate SWR cache for all pages
      mutate('food-log', {
        foodLog: foodLog ?? [],
        targets: { kcal: Number(settings?.macro_kcal ?? 2500), protein: Number(settings?.macro_protein ?? 180), carbs: Number(settings?.macro_carbs ?? 250), fat: Number(settings?.macro_fat ?? 80) },
        userId: user.id,
        today,
      }, false)

      mutate('products', products ?? [], false)

      mutate('today', {
        weather, upcomingActivity: upcoming,
        latestGezondheid: gezondheid?.[0] ?? null,
        foodLog: foodLog ?? [],
        settings,
      }, false)

      mutate('health-gezondheid', gezondheid ?? [], false)

      mutate('training', { activities: activities ?? [], hevy: hevy ?? [] }, false)
    }

    prefetch()
  }, [])

  return null
}
