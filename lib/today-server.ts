import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Server-side fetch + derivation of everything the Today dashboard needs, shaped
// to seed the SWR cache (keys: 'today', 'training', 'health-gezondheid', 'weather')
// so the first client paint already shows the correct screen instead of flashing
// blank → content. The client SWR fetchers still revalidate on mount, so this is
// purely a head-start; correctness never depends on the server guess being exact.

const HEALTH_FIELDS =
  'datum,stappen,gewicht,hartslag_rust,hrv_rmssd,slaap_minuten,slaap_score,slaap_diep,slaap_licht,slaap_rem,wakker_minuten,wakker_count,spo2,ademhalingsfrequentie,slaap_start_min,slaap_einde_min'

// Local YYYY-MM-DD in the given IANA timezone (en-CA formats as ISO date).
function localDateInTz(tz: string, d = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  }
}

// Pure date arithmetic anchored at noon UTC to dodge DST/midnight edges.
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function getGreetingName(fullName?: unknown, email?: string | null): string {
  const fromProfile = typeof fullName === 'string' ? fullName.trim() : ''
  const fromEmail = email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim() ?? ''
  const first = (fromProfile || fromEmail).split(/\s+/).find(Boolean)
  if (!first) return 'there'
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export type TodayFallback = Record<string, unknown>

export async function fetchTodayServerData(): Promise<TodayFallback> {
  let supabase
  try {
    supabase = await createServerSupabaseClient()
  } catch {
    return {}
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const cookieStore = await cookies()
  const tz = cookieStore.get('tz')?.value || 'Europe/Amsterdam'

  const todayStr = localDateInTz(tz)
  const todayIso = `${todayStr}T00:00:00`
  const sevenDaysAgoStr = addDaysStr(todayStr, -7)
  const sixtyDaysAgoIso = `${addDaysStr(todayStr, -60)}T00:00:00`
  // Monday-based week start, matching the client (getDay()+6)%7 offset.
  const dow = new Date(`${todayStr}T12:00:00Z`).getUTCDay() // 0=Sun
  const weekStartStr = addDaysStr(todayStr, -((dow + 6) % 7))

  const [
    gezondheidRes, foodTodayRes, food7dRes, settingsRes,
    calendarRes, activitiesRes, hevyRes, weatherRes,
  ] = await Promise.all([
    supabase.from('gezondheid').select(HEALTH_FIELDS).eq('user_id', user.id).order('datum', { ascending: false }).limit(30),
    supabase.from('food_log').select('kcal,protein,carbs,fat,food_name,logged_at,amount_g,meal_category').eq('user_id', user.id).eq('date', todayStr),
    supabase.from('food_log').select('date,protein').eq('user_id', user.id).gte('date', sevenDaysAgoStr).order('date', { ascending: false }),
    supabase.from('user_settings').select('macro_kcal,macro_protein,macro_carbs,macro_fat,step_goal,training_intensity,training_frequencies,training_goal,training_sport_priority,training_goal_priority,training_injuries,training_self_planned,training_zone_targets').eq('user_id', user.id).maybeSingle(),
    supabase.from('calendar_events').select('id,title,start_date,start_datetime,end_datetime').eq('user_id', user.id).gte('start_date', todayStr).order('start_date', { ascending: true }),
    supabase.from('strava_activities').select('id,name,sport_type,start_date,distance,moving_time,elapsed_time,total_elevation_gain,average_speed,average_heartrate,average_cadence,kilojoules,average_watts,weighted_average_watts').eq('user_id', user.id).gte('start_date', sixtyDaysAgoIso).order('start_date', { ascending: false }),
    supabase.from('hevy_workouts').select('id,title,start_time,end_time,duration,volume_kg,sets,exercises').eq('user_id', user.id).gte('start_time', sixtyDaysAgoIso).order('start_time', { ascending: false }),
    supabase.from('weather_cache').select('*').eq('id', 'current').maybeSingle(),
  ])

  const gezondheid = gezondheidRes.data ?? []
  const foodLogToday = foodTodayRes.data ?? []
  const foodLog7d = food7dRes.data ?? []
  const settings = settingsRes.data ?? null
  const calendarEvents = calendarRes.data ?? []
  const activities = activitiesRes.data ?? []
  const hevy = hevyRes.data ?? []
  const weather = weatherRes.data ?? null

  // Caffeine per logged product name (used by the lifestyle focus card).
  const foodNames = foodLogToday.map((f: { food_name?: string }) => f.food_name).filter(Boolean)
  const caffeineByName: Record<string, number> = {}
  if (foodNames.length > 0) {
    const { data: prods } = await supabase
      .from('products').select('name,caffeine').in('name', foodNames as string[]).not('caffeine', 'is', null)
    for (const p of prods ?? []) {
      if (p.caffeine) caffeineByName[(p.name ?? '').toLowerCase()] = Number(p.caffeine)
    }
  }

  const todayActivities = activities.filter((a: { start_date?: string }) => (a.start_date ?? '') >= todayStr)
  const weekActivities = activities.filter((a: { start_date?: string }) => (a.start_date ?? '') >= weekStartStr)
  const todayHevy = hevy.filter((h: { start_time?: string }) => (h.start_time ?? '') >= todayIso)
  const latestGezondheid = gezondheid.find((r: { datum?: string }) => r.datum === todayStr) ?? null

  const s = (settings ?? {}) as Record<string, unknown>

  return {
    today: {
      userName: getGreetingName(user.user_metadata?.full_name, user.email),
      latestGezondheid,
      foodLogToday,
      foodLog7d,
      settings,
      calendarEvents,
      todayHevy,
      todayActivities,
      allHevy: hevy.filter((h: { start_time?: string }) => (h.start_time ?? '') >= weekStartStr),
      allActivities: weekActivities,
      caffeineByName,
    },
    training: {
      activities,
      hevy,
      calendarEvents,
      trainingFrequencies: s.training_frequencies ?? {},
      sportPriority: s.training_sport_priority ?? [],
      goalPriority: s.training_goal_priority ?? [],
      injuries: s.training_injuries ?? {},
      selfPlanned: s.training_self_planned ?? {},
      zoneTargets: s.training_zone_targets ?? {},
    },
    'health-gezondheid': gezondheid,
    weather: weather
      ? {
          temp_c: Number((weather as Record<string, unknown>).temp) || null,
          night_temp_c: Number((weather as Record<string, unknown>).night_temp_c) || null,
          city: (weather as Record<string, unknown>).city ?? null,
        }
      : undefined,
  }
}
