import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Server-side fetchers that mirror the client SWR fetchers for the Training,
// Health, Food and Coach tabs, shaped to seed the SWR cache so the first client
// paint already shows the correct screen. The client fetchers still revalidate
// on mount, so these are a head-start, not a source of truth — keep them in sync
// with the corresponding client fetchers (app/*/fetcher(s).ts).

const HEALTH_FIELDS =
  'datum,stappen,gewicht,hartslag_rust,hrv_rmssd,slaap_minuten,slaap_score,slaap_diep,slaap_licht,slaap_rem,wakker_minuten,wakker_count,spo2,ademhalingsfrequentie,slaap_start_min,slaap_einde_min'

type Supa = Awaited<ReturnType<typeof createServerSupabaseClient>>
type User = { id: string; email?: string | null; user_metadata?: Record<string, unknown> }

// Local YYYY-MM-DD in the given IANA timezone (en-CA formats as ISO date).
function localDateInTz(tz: string, d = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  }
}

async function getCtx(): Promise<{ supabase: Supa; user: User; tz: string } | null> {
  let supabase: Supa
  try {
    supabase = await createServerSupabaseClient()
  } catch {
    return null
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const tz = (await cookies()).get('tz')?.value || 'Europe/Amsterdam'
  return { supabase, user, tz }
}

// ─── Per-key fetchers ───────────────────────────────────────────────────────

async function fetchHealthRows(supabase: Supa, user: User) {
  const { data } = await supabase
    .from('gezondheid').select(HEALTH_FIELDS)
    .eq('user_id', user.id).order('datum', { ascending: false }).limit(30)
  return data ?? []
}

async function fetchHiddenPages(supabase: Supa, user: User): Promise<string[]> {
  const { data } = await supabase.from('user_settings').select('hidden_pages').eq('user_id', user.id).maybeSingle()
  return Array.isArray(data?.hidden_pages) ? (data.hidden_pages as string[]) : []
}

async function fetchWeather(supabase: Supa) {
  const { data: weather } = await supabase.from('weather_cache').select('*').eq('id', 'current').maybeSingle()
  if (!weather) return undefined
  const w = weather as Record<string, unknown>
  return {
    temp_c: Number(w.temp) || null,
    night_temp_c: Number(w.night_temp_c) || null,
    city: w.city ?? null,
    hourly_forecast: w.hourly_forecast ?? null,
  }
}

// Mirrors app/food/fetchers.ts fetchFoodData(date). Uses the UTC date to match
// FoodClient's initial key (`food-log-${new Date().toISOString().slice(0,10)}`).
async function fetchFood(supabase: Supa, user: User, date: string) {
  const [{ data: foodLog }, { data: settings }] = await Promise.all([
    supabase.from('food_log')
      .select('id, meal_category, food_name, amount_g, kcal, protein, carbs, fat, logged_at')
      .eq('user_id', user.id).eq('date', date).order('logged_at', { ascending: true }),
    supabase.from('user_settings')
      .select('macro_kcal, macro_protein, macro_carbs, macro_fat, training_goal')
      .eq('user_id', user.id).maybeSingle(),
  ])
  return {
    foodLog: foodLog ?? [],
    targets: {
      kcal: Number(settings?.macro_kcal ?? 2500),
      protein: Number(settings?.macro_protein ?? 180),
      carbs: Number(settings?.macro_carbs ?? 250),
      fat: Number(settings?.macro_fat ?? 80),
      goalType: settings?.training_goal === 'lose_weight' ? 'cut'
        : settings?.training_goal === 'build_muscle' ? 'bulk'
        : 'maintain',
    },
    userId: user.id,
    today: date,
  }
}

// Mirrors app/training/fetcher.ts trainingFetcher().
async function fetchTraining(supabase: Supa, user: User) {
  const now = new Date()
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()
  const sixtyDaysAgoDate = sixtyDaysAgo.split('T')[0]

  const [{ data: activities }, { data: hevy }, { data: calendarEvents }, { data: settings }, { data: biasRows }] = await Promise.all([
    supabase.from('strava_activities')
      .select('id,name,sport_type,start_date,distance,moving_time,elapsed_time,total_elevation_gain,average_speed,max_speed,average_heartrate,max_heartrate,average_cadence,kilojoules,average_watts,weighted_average_watts,suffer_score,map_polyline')
      .eq('user_id', user.id).gte('start_date', sixtyDaysAgo).order('start_date', { ascending: false }),
    supabase.from('hevy_workouts')
      .select('id,title,start_time,end_time,duration,volume_kg,sets,exercises')
      .eq('user_id', user.id).gte('start_time', sixtyDaysAgo).order('start_time', { ascending: false }),
    supabase.from('calendar_events')
      .select('id,title,start_date,start_datetime,end_datetime')
      .eq('user_id', user.id).gte('start_date', sixtyDaysAgoDate).order('start_date', { ascending: true }),
    supabase.from('user_settings')
      .select('training_frequencies,training_goal,training_sport_priority,training_goal_priority,training_intensity,training_injuries,training_self_planned,age,max_hr,training_zone_targets')
      .eq('user_id', user.id).maybeSingle(),
    supabase.from('coach_bias_adjustments')
      .select('sport_type, bias_adjustment, conservativeness_adjustment, confidence, reason, behavior_consistency_pct')
      .eq('user_id', user.id),
  ])

  const sportKeywords = ['gym', 'run', 'loop', 'ride', 'fietsen', 'zwemmen', 'swim', 'voetbal', 'tennis', 'volleybal', 'training', 'workout', 'strength', 'push', 'pull', 'squat', 'toernooi', 'duurloop', 'interval', 'zone', 'sport', 'sporten', 'hardlopen', 'wielren', 'crossfit', 'kracht', 'fitness', 'gewichten', 'deadlift', 'bench', 'upper', 'lower', 'legs']
  const isSportEvent = (e: { title: string }) => sportKeywords.some(kw => e.title.toLowerCase().includes(kw))
  const eventTimeOf = (e: { start_datetime?: string | null; start_date: string }) =>
    e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date)

  const filteredCalendarEvents = (calendarEvents ?? []).filter((e) => eventTimeOf(e) >= now && isSportEvent(e))
  const pastCalendarEvents = (calendarEvents ?? []).filter((e) => eventTimeOf(e) < now && isSportEvent(e))

  const s = (settings ?? {}) as Record<string, any>
  const trainingFrequencies: Record<string, number> = s.training_frequencies ?? {}
  const sportPriority: string[] = s.training_sport_priority ?? ['running', 'cycling', 'swimming', 'gym']
  const age: number | null = s.age ?? null
  const maxHrOverride: number | null = s.max_hr ?? null
  const maxHeartRate: number | null = maxHrOverride ?? (age ? Math.round(208 - 0.7 * age) : null)

  const biasBySport: Record<string, number> = {}
  for (const row of (biasRows ?? []) as any[]) {
    if (row.confidence !== 'low') biasBySport[row.sport_type] = row.bias_adjustment ?? 0
  }
  const coachLearned = ((biasRows ?? []) as any[])
    .filter((row) => row.confidence !== 'low' && Number(row.bias_adjustment ?? 0) !== 0)
    .map((row) => ({
      sport_type: row.sport_type as string,
      bias_adjustment: Number(row.bias_adjustment ?? 0),
      confidence: row.confidence,
      reason: (row.reason as string) ?? '',
      consistency_pct: Number(row.behavior_consistency_pct ?? 0),
    }))

  return {
    activities: activities ?? [],
    hevy: hevy ?? [],
    calendarEvents: filteredCalendarEvents,
    pastCalendarEvents,
    trainingFrequencies,
    trainingGoal: s.training_goal ?? null,
    sportPriority,
    trainingIntensity: s.training_intensity ?? 'moderate',
    goalPriority: s.training_goal_priority ?? [],
    biasBySport,
    coachLearned,
    injuries: s.training_injuries ?? {},
    selfPlanned: s.training_self_planned ?? {},
    maxHeartRate,
    zoneTargets: s.training_zone_targets ?? {},
  }
}

// ─── Route-level fallbacks ──────────────────────────────────────────────────

export async function trainingFallback(): Promise<Record<string, unknown>> {
  const ctx = await getCtx()
  if (!ctx) return {}
  return { training: await fetchTraining(ctx.supabase, ctx.user) }
}

export async function healthFallback(): Promise<Record<string, unknown>> {
  const ctx = await getCtx()
  if (!ctx) return {}
  const [rows, hidden] = await Promise.all([
    fetchHealthRows(ctx.supabase, ctx.user),
    fetchHiddenPages(ctx.supabase, ctx.user),
  ])
  return { 'health-gezondheid': rows, 'user-settings-pages': hidden }
}

export async function foodFallback(): Promise<Record<string, unknown>> {
  const ctx = await getCtx()
  if (!ctx) return {}
  const date = new Date().toISOString().slice(0, 10) // UTC — matches FoodClient's key
  return { [`food-log-${date}`]: await fetchFood(ctx.supabase, ctx.user, date) }
}

export async function coachFallback(): Promise<Record<string, unknown>> {
  const ctx = await getCtx()
  if (!ctx) return {}
  const date = new Date().toISOString().slice(0, 10)
  const [rows, training, food, weather] = await Promise.all([
    fetchHealthRows(ctx.supabase, ctx.user),
    fetchTraining(ctx.supabase, ctx.user),
    fetchFood(ctx.supabase, ctx.user, date),
    fetchWeather(ctx.supabase),
  ])
  return {
    'health-gezondheid': rows,
    training,
    [`food-log-${date}`]: food,
    weather,
  }
}
