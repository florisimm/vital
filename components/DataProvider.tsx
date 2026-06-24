'use client'

import { useEffect } from 'react'
import { mutate } from 'swr'
import { createClient } from '@/lib/supabase'
import { saveCache } from '@/components/SWRProvider'
import { fetchServices } from '@/lib/services'

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
        { data: foodLog }, { data: settings },
        { data: weather }, { data: upcoming }, { data: gezondheid },
        { data: activities }, { data: hevy }, { data: calendarEvents },
        { data: gcalToken }, services,
      ] = await Promise.all([
        supabase.from('food_log').select('id,meal_category,food_name,amount_g,kcal,protein,carbs,fat,logged_at').eq('user_id', user.id).eq('date', today).order('logged_at', { ascending: true }),
        supabase.from('user_settings').select('macro_kcal,macro_protein,macro_carbs,macro_fat,training_frequencies,training_goal,training_sport_priority,training_goal_priority,training_intensity,training_injuries,training_self_planned,training_zone_targets').eq('user_id', user.id).single(),
        supabase.from('weather_cache').select('*').eq('id', 'current').single(),
        supabase.from('strava_activities').select('name,sport_type,start_date,distance,moving_time').eq('user_id', user.id).gte('start_date', new Date().toISOString()).order('start_date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('gezondheid').select('datum,stappen,gewicht,hartslag_rust,hrv_rmssd,slaap_minuten,slaap_score,slaap_diep,slaap_licht,slaap_rem,wakker_minuten,wakker_count,spo2,ademhalingsfrequentie,slaap_start_min,slaap_einde_min').eq('user_id', user.id).order('datum', { ascending: false }).limit(30),
        supabase.from('strava_activities').select('id,name,sport_type,start_date,distance,moving_time,elapsed_time,total_elevation_gain,average_speed,average_heartrate,average_cadence,kilojoules,average_watts,weighted_average_watts').eq('user_id', user.id).gte('start_date', thirtyDaysAgo).order('start_date', { ascending: false }),
        supabase.from('hevy_workouts').select('id,title,start_time,end_time,duration,volume_kg,sets,exercises').eq('user_id', user.id).gte('start_time', thirtyDaysAgo).order('start_time', { ascending: false }),
        supabase.from('calendar_events').select('id,title,start_date,start_datetime,end_datetime').eq('user_id', user.id).gte('start_date', today).order('start_date', { ascending: true }),
        supabase.from('google_calendar_tokens').select('user_id').eq('user_id', user.id).maybeSingle(),
        fetchServices(),
      ])

      // Warm the profile/connections cache so Strava/Hevy/Health/Calendar show
      // their real connected state immediately instead of an empty "…" placeholder.
      mutate('profile-services', services, false)

      // Populate SWR cache for all pages
      mutate('food-log', {
        foodLog: foodLog ?? [],
        targets: { kcal: Number(settings?.macro_kcal ?? 2500), protein: Number(settings?.macro_protein ?? 180), carbs: Number(settings?.macro_carbs ?? 250), fat: Number(settings?.macro_fat ?? 80) },
        userId: user.id,
        today,
      }, false)

      // Pre-populate 'weather' SWR key from the already-fetched weather_cache row
      // so Today/Health/Coach tabs don't need to call /api/weather on first render.
      if (weather) {
        mutate('weather', {
          temp_c:       Number(weather.temp)        || null,
          night_temp_c: Number((weather as any).night_temp_c) || null,
          city:         (weather as any).city        ?? null,
        }, false)
      }

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

      mutate('training', {
        activities: activities ?? [],
        hevy: hevy ?? [],
        calendarEvents: upcomingCalendar,
        trainingFrequencies: (settings as any)?.training_frequencies ?? {},
        sportPriority: (settings as any)?.training_sport_priority ?? [],
        goalPriority: (settings as any)?.training_goal_priority ?? [],
        injuries: (settings as any)?.training_injuries ?? {},
        selfPlanned: (settings as any)?.training_self_planned ?? {},
        zoneTargets: (settings as any)?.training_zone_targets ?? {},
      }, false)

      // Persist to localStorage immediately so iOS has data on next cold start
      saveCache()

      // Sync Google Calendar only if user has connected it — skips the edge function
      // call entirely for users who haven't linked Google Calendar
      if (gcalToken) {
        const { data: { session } } = await supabase.auth.getSession()
        fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/google-calendar-sync`,
          { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) } }
        ).then(() => mutate('training')).catch(() => {/* silent */})
      }
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
      const [{ data: tok }, { data: todayRow }] = await Promise.all([
        supabase.from('fitbit_tokens').select('last_synced_at').eq('user_id', user.id).maybeSingle(),
        supabase.from('gezondheid').select('slaap_minuten').eq('user_id', user.id).eq('datum', today).maybeSingle(),
      ])
      if (!tok || cancelled) return // not connected

      const last = tok.last_synced_at ? new Date(tok.last_synced_at).getTime() : 0
      const syncedRecently = (Date.now() - last) / 60_000 < 30 // 30-min cooldown
      const hasTodaySleep = todayRow?.slaap_minuten != null
      // Skip only when sleep is already present AND we synced within the last 30 min
      if (syncedRecently && hasTodaySleep) return

      await fetch('/api/fitbit/sync', { method: 'POST' }).catch(() => {/* silent */})
      if (cancelled) return
      await refreshHealthCache(user.id)
    }

    autoSync()
    const id = setInterval(autoSync, 30 * 60 * 1000) // every 30 min while app is open

    // Re-sync when user brings the app to the foreground (e.g. waking up, switching tabs)
    function onVisible() { if (document.visibilityState === 'visible') autoSync() }
    document.addEventListener('visibilitychange', onVisible)

    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  return null
}

