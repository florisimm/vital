'use client'

import { useEffect } from 'react'
import { mutate } from 'swr'
import { createClient } from '@/lib/supabase'
import { saveCache } from '@/components/SWRProvider'

// Prefetches all app data into the SWR cache on first render,
// so every tab has data ready before the user clicks it.
// Also auto-syncs Google Calendar in the background on every app open.
export function DataProvider() {
  useEffect(() => {
    async function prefetch() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date().toISOString().split('T')[0]
      const thirtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()
      const weekStart = (() => {
        const d = new Date(); d.setHours(0,0,0,0)
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        return d.toISOString()
      })()

      // Fire all queries in parallel — including calendar_events so training tab has data immediately
      const [
        { data: foodLog }, { data: settings }, { data: products },
        { data: weather }, { data: upcoming }, { data: gezondheid },
        { data: activities }, { data: hevy }, { data: calendarEvents },
      ] = await Promise.all([
        supabase.from('food_log').select('id,meal_category,food_name,amount_g,kcal,protein,carbs,fat,logged_at').eq('user_id', user.id).eq('date', today).order('logged_at', { ascending: true }),
        supabase.from('user_settings').select('macro_kcal,macro_protein,macro_carbs,macro_fat,training_frequencies').eq('user_id', user.id).single(),
        supabase.from('products').select('id,name,brand,kcal,protein,carbs,fat,servings').or(`user_id.eq.${user.id},user_id.is.null`).order('name'),
        supabase.from('weather_cache').select('*').eq('id', 'current').single(),
        supabase.from('strava_activities').select('name,sport_type,start_date,distance,moving_time').eq('user_id', user.id).gte('start_date', new Date().toISOString()).order('start_date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('gezondheid').select('datum,stappen,gewicht,hartslag_rust,hrv_rmssd,slaap_minuten,slaap_score,slaap_diep,slaap_licht,slaap_rem,wakker_minuten,wakker_count,spo2,ademhalingsfrequentie,slaap_start_min,slaap_einde_min').eq('user_id', user.id).order('datum', { ascending: false }).limit(30),
        supabase.from('strava_activities').select('id,name,sport_type,start_date,distance,moving_time,elapsed_time,total_elevation_gain,average_speed,average_heartrate,average_cadence,kilojoules,average_watts,weighted_average_watts').eq('user_id', user.id).gte('start_date', thirtyDaysAgo).order('start_date', { ascending: false }),
        supabase.from('hevy_workouts').select('id,title,start_time,end_time,duration,volume_kg,sets,exercises').eq('user_id', user.id).gte('start_time', thirtyDaysAgo).order('start_time', { ascending: false }),
        supabase.from('calendar_events').select('id,title,start_date,start_datetime,end_datetime').eq('user_id', user.id).gte('start_date', today).order('start_date', { ascending: true }),
      ])

      // Populate SWR cache for all pages
      mutate('food-log', {
        foodLog: foodLog ?? [],
        targets: { kcal: Number(settings?.macro_kcal ?? 2500), protein: Number(settings?.macro_protein ?? 180), carbs: Number(settings?.macro_carbs ?? 250), fat: Number(settings?.macro_fat ?? 80) },
        userId: user.id,
        today,
      }, false)

      mutate('products', products ?? [], false)

      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
      const todayIso = `${today}T00:00:00`
      const sportKeywords = ['gym', 'run', 'loop', 'ride', 'fietsen', 'zwemmen', 'swim', 'voetbal', 'tennis', 'volleybal', 'training', 'workout', 'strength', 'push', 'pull', 'squat', 'toernooi', 'duurloop', 'interval', 'zone', 'sport', 'sporten', 'hardlopen', 'wielren', 'crossfit', 'yoga', 'padel', 'hockey', 'basketbal', 'wielrennen']

      // Parse date-only strings as local midnight (not UTC) to avoid timezone filtering bugs
      const upcomingCalendar = (calendarEvents ?? []).filter((e: any) => {
        const t = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date + 'T00:00:00')
        if (t < startOfToday) return false
        return sportKeywords.some((kw: string) => e.title.toLowerCase().includes(kw))
      })

      const todayHevy = (hevy ?? []).filter((h: any) => new Date(h.start_time) >= startOfToday)
      const todayActivities = (activities ?? []).filter((a: any) => new Date(a.start_date) >= startOfToday)

      const allUpcoming = (calendarEvents ?? []).filter((e: any) => {
        const t = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date + 'T00:00:00')
        return t >= startOfToday
      })

      mutate('today', {
        weather, upcomingActivity: upcoming,
        latestGezondheid: gezondheid?.[0] ?? null,
        foodLogToday: foodLog ?? [],
        foodLog7d: [],
        settings,
        calendarEvents: allUpcoming,
        todayHevy,
        todayActivities,
      }, false)

      mutate('health-gezondheid', gezondheid ?? [], false)

      mutate('training', { activities: activities ?? [], hevy: hevy ?? [], calendarEvents: upcomingCalendar }, false)

      // Persist to localStorage immediately so iOS has data on next cold start
      saveCache()

      // Sync Google Calendar in background AFTER cache is warm — when done, revalidate training
      const { data: { session } } = await supabase.auth.getSession()
      fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/google-calendar-sync`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) } }
      ).then(() => mutate('training')).catch(() => {/* silent */})
    }

    prefetch()
  }, [])

  // Supabase Realtime — instant SWR revalidation when DB rows change.
  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const today = () => new Date().toISOString().split('T')[0]

      channel = supabase
        .channel('app-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'strava_activities', filter: `user_id=eq.${user.id}` }, () => {
          mutate('training'); mutate('today')
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hevy_workouts', filter: `user_id=eq.${user.id}` }, () => {
          mutate('training'); mutate('today')
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `user_id=eq.${user.id}` }, () => {
          mutate('training'); mutate('today')
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${user.id}` }, () => {
          mutate('training'); mutate('today')
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gezondheid', filter: `user_id=eq.${user.id}` }, () => {
          mutate('health-gezondheid'); mutate('today')
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'food_log', filter: `user_id=eq.${user.id}` }, () => {
          const d = today(); mutate('food-log'); mutate(`food-log-${d}`)
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_bias_adjustments', filter: `user_id=eq.${user.id}` }, () => {
          mutate('training')
        })
        .subscribe()
    })

    return () => { if (channel) supabase.removeChannel(channel) }
  }, [])

  // Keep health data fresh automatically — no manual sync button.
  // Runs on every app open and re-checks hourly while the app stays open.
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function refreshHealthCache(userId: string) {
      const { data: rows } = await supabase
        .from('gezondheid')
        .select('datum,stappen,gewicht,hartslag_rust,hrv_rmssd,slaap_minuten,slaap_score,slaap_diep,slaap_licht,slaap_rem,wakker_minuten,wakker_count,spo2,ademhalingsfrequentie,slaap_start_min,slaap_einde_min')
        .eq('user_id', userId)
        .order('datum', { ascending: false })
        .limit(30)

      if (!cancelled) {
        mutate('health-gezondheid', rows ?? [], false)
        mutate('today', (current: any) => current ? { ...current, latestGezondheid: rows?.[0] ?? null } : current, false)
      }
    }

    async function autoSync() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const today = new Date().toISOString().split('T')[0]
      const [{ data: tok }, { data: latestRow }] = await Promise.all([
        supabase.from('fitbit_tokens').select('last_synced_at').eq('user_id', user.id).maybeSingle(),
        supabase.from('gezondheid').select('datum').eq('user_id', user.id).order('datum', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (!tok || cancelled) return // not connected

      const last = tok.last_synced_at ? new Date(tok.last_synced_at).getTime() : 0
      const syncedRecently = (Date.now() - last) / 3_600_000 < 3
      const hasTodayRow = latestRow?.datum === today
      if (syncedRecently && hasTodayRow) return

      await fetch('/api/fitbit/sync', { method: 'POST' }).catch(() => {/* silent */})
      if (cancelled) return
      await refreshHealthCache(user.id)
    }

    autoSync()
    const id = setInterval(autoSync, 60 * 60 * 1000) // hourly while app is open
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return null
}

