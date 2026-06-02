'use client'

import useSWR from 'swr'
import { Sparkles, CloudSun } from 'lucide-react'
import { PremiumScreen } from '@/components/PremiumScreen'
import { Card, SectionHeader, MetricRow } from '@/components/ui'
import { createClient } from '@/lib/supabase'

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchTodayData() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const today = new Date().toISOString().split('T')[0]

  const [{ data: weather }, { data: upcoming }, { data: gezondheid }, { data: foodLog }, { data: settings }] = await Promise.all([
    supabase.from('weather_cache').select('*').eq('id', 'current').single(),
    supabase.from('strava_activities').select('name,sport_type,start_date,distance,moving_time').eq('user_id', user.id).gte('start_date', new Date().toISOString()).order('start_date', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('gezondheid').select('stappen,gewicht,datum').eq('user_id', user.id).order('datum', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('food_log').select('kcal,protein').eq('user_id', user.id).eq('date', today),
    supabase.from('user_settings').select('macro_kcal,macro_protein').eq('user_id', user.id).maybeSingle(),
  ])

  return { weather, upcoming, gezondheid, foodLog: foodLog ?? [], settings }
}

// ─── Date string ──────────────────────────────────────────────────────────────

function formatSubtitle() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
}

// ─── Hero action card ─────────────────────────────────────────────────────────

function HeroActionCard({ upcoming, kcalLeft, proteinLeft }: {
  upcoming: string | null; kcalLeft: number; proteinLeft: number
}) {
  const actions = [
    upcoming ?? 'Plan je training voor vandaag',
    proteinLeft > 10 ? `Eet nog ${Math.round(proteinLeft)}g eiwit vandaag` : 'Eiwitdoel bereikt ✓',
    'Prioritize sleep tonight',
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
          <div key={i} className="flex items-center gap-3.5">
            <div className="w-[7px] h-[7px] rounded-full bg-white shrink-0" />
            <span className="text-[20px] font-semibold text-white">{a}</span>
          </div>
        ))}
      </div>

      <a
        href="/food"
        className="flex items-center justify-center w-full h-[54px] rounded-[18px] bg-white text-black font-semibold text-[16px]"
      >
        {upcoming ? 'Start with the run' : 'Log voeding'}
      </a>
    </div>
  )
}

// ─── Weather card ─────────────────────────────────────────────────────────────

function WeatherImpactCard({ weather }: { weather: any }) {
  if (!weather) return null
  const temp = Math.round(Number(weather.temp))
  const wind = Math.round(Number(weather.windspeed))
  const desc = `Het is ${temp}°C met wind van ${wind} km/u. ${temp < 20 && wind < 20 ? 'Goed trainingsmoment vandaag.' : 'Houd rekening met het weer bij je training.'}`

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

// ─── Upcoming workout card ────────────────────────────────────────────────────

function UpcomingWorkoutCard({ upcoming }: { upcoming: { name: string; start_date: string; distance: number | null } | null }) {
  if (!upcoming) return null
  const time = new Date(upcoming.start_date).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const dist = upcoming.distance ? `${(upcoming.distance / 1000).toFixed(1)} km · ` : ''

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <SectionHeader title="Upcoming workout" detail={time} />
        <span className="text-[22px] font-bold text-white">{upcoming.name}</span>
        {dist ? <p className="text-white/50 leading-relaxed text-[17px]">{dist}</p> : null}
      </div>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const { data } = useSWR('today', fetchTodayData, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })

  const totalKcal = (data?.foodLog ?? []).reduce((s, f) => s + Number(f.kcal ?? 0), 0)
  const totalProtein = (data?.foodLog ?? []).reduce((s, f) => s + Number(f.protein ?? 0), 0)
  const targetKcal = Number(data?.settings?.macro_kcal ?? 2500)
  const targetProtein = Number(data?.settings?.macro_protein ?? 180)
  const kcalLeft = Math.max(0, targetKcal - totalKcal)
  const proteinLeft = Math.max(0, targetProtein - totalProtein)
  const upcomingName = data?.upcoming?.name ?? null

  return (
    <PremiumScreen title="Today" subtitle={formatSubtitle()}>

      {/* Hero */}
      <HeroActionCard upcoming={upcomingName} kcalLeft={kcalLeft} proteinLeft={proteinLeft} />

      {/* Weather */}
      <WeatherImpactCard weather={data?.weather} />

      {/* Upcoming workout */}
      <UpcomingWorkoutCard upcoming={data?.upcoming ?? null} />

    </PremiumScreen>
  )
}
