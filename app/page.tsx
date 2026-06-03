'use client'

import useSWR from 'swr'
import { Sparkles, Heart, Moon, CloudSun } from 'lucide-react'
import { PremiumScreen } from '@/components/PremiumScreen'
import { Card, SectionHeader, MetricTile, MetricRow } from '@/components/ui'
import { createClient } from '@/lib/supabase'

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchTodayData() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  const [{ data: weather }, { data: gezondheid }, { data: foodLog }, { data: settings }, { data: calendarEvents }] = await Promise.all([
    supabase.from('weather_cache').select('*').eq('id', 'current').single(),
    supabase.from('gezondheid').select('stappen,gewicht,datum').eq('user_id', user.id).order('datum', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('food_log').select('kcal,protein').eq('user_id', user.id).eq('date', today),
    supabase.from('user_settings').select('macro_kcal,macro_protein').eq('user_id', user.id).maybeSingle(),
    supabase.from('calendar_events').select('id,title,start_date,start_datetime').eq('user_id', user.id).gte('start_date', today).order('start_date', { ascending: true }),
  ])

  const upcomingCalendar = (calendarEvents ?? []).filter((e: any) => {
    const t = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date)
    return t >= now
  })

  return { weather, gezondheid, foodLog: foodLog ?? [], settings, calendarEvents: upcomingCalendar }
}

// ─── Date string ──────────────────────────────────────────────────────────────

function formatSubtitle() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
}

// ─── Hero action card ─────────────────────────────────────────────────────────

function HeroActionCard({ nextWorkout, showTrainingLink, proteinLeft }: {
  nextWorkout: { title: string; start_datetime: string | null } | null
  showTrainingLink: boolean
  proteinLeft: number
}) {
  const workoutLabel = nextWorkout
    ? (() => {
        const t = nextWorkout.start_datetime ? new Date(nextWorkout.start_datetime) : null
        const time = t ? t.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : null
        return time ? `${nextWorkout.title} at ${time}` : nextWorkout.title
      })()
    : 'No workout planned today'

  const actions = [
    workoutLabel,
    proteinLeft > 10 ? `Eat ${Math.round(proteinLeft)}g more protein today` : 'Protein goal reached ✓',
    'Be in bed by 23:00',
  ]

  return (
    <div
      className="p-6 rounded-[30px] border border-white/[0.14]"
      style={{ background: 'rgba(255,255,255,0.10)' }}
    >
      <div className="flex items-center justify-between mb-6">
        <span className="text-[31px] font-bold text-white leading-tight">Today's Actions</span>
        <Sparkles size={24} className="text-orange-400" />
      </div>

      <div className="flex flex-col gap-4 mb-6">
        {actions.map((a, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-3.5">
              <div className="w-[7px] h-[7px] rounded-full bg-white shrink-0" />
              <span className="text-[20px] font-semibold text-white">{a}</span>
            </div>
            {i === 0 && showTrainingLink && (
              <a
                href={`/training/session?title=${encodeURIComponent(nextWorkout!.title)}&time=${encodeURIComponent(nextWorkout!.start_datetime ?? '')}`}
                className="ml-[23px] text-[14px] font-semibold text-teal-400"
              >
                View training →
              </a>
            )}
          </div>
        ))}
      </div>

      <a
        href="/food"
        className="flex items-center justify-center w-full h-[54px] rounded-[18px] bg-white text-black font-semibold text-[16px]"
      >
        Log food
      </a>
    </div>
  )
}

// ─── Weather card ─────────────────────────────────────────────────────────────

function buildWeatherText(weather: any): string {
  const temp     = Math.round(Number(weather.temp))
  const feels    = Math.round(Number(weather.feels_like))
  const wind     = Math.round(Number(weather.windspeed))
  const code     = Number(weather.weather_code)
  const precip   = Number(weather.precipitation)
  const uv       = Number(weather.uv_index_max)

  if (code >= 95)
    return `Thunderstorm expected — skip outdoor training today.`
  if (code >= 51 || precip > 2)
    return `Rain expected (${precip}mm) — consider training indoors.`
  if (wind > 30)
    return `Strong winds (${wind} km/h) — avoid cycling outdoors.`
  if (uv > 7)
    return `UV index ${uv.toFixed(1)} — protect yourself if training outdoors between 11:00–15:00.`
  if (temp > 28)
    return `It's warm (${temp}°C, feels like ${feels}°C) — hydrate well and train in the morning or evening.`
  if (temp < 5)
    return `Cold outside (${temp}°C, feels like ${feels}°C) — warm up well before training.`
  return `${temp}°C with ${wind} km/h wind — good conditions for training today.`
}

function WeatherImpactCard({ weather }: { weather: any }) {
  const desc = weather ? buildWeatherText(weather) : '–'

  return (
    <Card>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <CloudSun size={18} className="text-white" />
          <span className="text-[17px] font-semibold text-white">Weather impact</span>
        </div>
        <p className="text-white/50 leading-relaxed text-[17px]">{desc}</p>
      </div>
    </Card>
  )
}


// ─── Page ─────────────────────────────────────────────────────────────────────

// Strava-trackable sports (cycling + running)
const STRAVA_KEYWORDS = ['fietsen', 'ride', 'cycling', 'wielren', 'hardlopen', 'run', 'loop', 'duurloop', 'interval', 'tempoloop']

export default function TodayPage() {
  const { data } = useSWR('today', fetchTodayData, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })

  const nextWorkout = data?.calendarEvents?.[0] ?? null
  const isStravaType = nextWorkout !== null &&
    STRAVA_KEYWORDS.some(k => nextWorkout.title.toLowerCase().includes(k))

  const totalProtein = (data?.foodLog ?? []).reduce((s, f) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(data?.settings?.macro_protein ?? 180)
  const proteinLeft = Math.max(0, targetProtein - totalProtein)

  return (
    <PremiumScreen title="Today" subtitle={formatSubtitle()}>

      {/* Hero */}
      <HeroActionCard nextWorkout={nextWorkout} showTrainingLink={isStravaType} proteinLeft={proteinLeft} />

      {/* Current state */}
      <SectionHeader title="Current state" detail="AI summary" />
      <div className="grid grid-cols-2 gap-3">
        <MetricTile
          title="Recovery"
          value="–"
          unit=""
          note="–"
          Icon={Heart}
          tint="text-teal-400"
        />
        <MetricTile
          title="Sleep"
          value="–"
          unit=""
          note="–"
          Icon={Moon}
          tint="text-indigo-400"
        />
      </div>

      {/* Weather */}
      <WeatherImpactCard weather={data?.weather} />

      {/* Daily priorities */}
      <Card>
        <div className="flex flex-col gap-3">
          <SectionHeader title="Daily priorities" detail="–" />
          <MetricRow title="Hydration" value="–" detail="–" />
          <MetricRow title="Mobility" value="–" detail="–" />
          <MetricRow title="Sleep window" value="–" detail="–" />
        </div>
      </Card>

    </PremiumScreen>
  )
}
