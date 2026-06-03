'use client'

import useSWR from 'swr'
import { Sparkles, ChevronRight } from 'lucide-react'
import { PremiumScreen } from '@/components/PremiumScreen'
import { SectionHeader } from '@/components/ui'
import { createClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightStatus = 'good' | 'warning' | 'alert' | 'neutral'

interface Insight {
  id: string
  title: string
  value: string
  unit: string
  status: InsightStatus
  explanation: string
  trend?: string
  href?: string
  priority: number
}

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
    supabase.from('food_log').select('kcal,protein,carbs,fat').eq('user_id', user.id).eq('date', today),
    supabase.from('user_settings').select('macro_kcal,macro_protein,macro_carbs,macro_fat').eq('user_id', user.id).maybeSingle(),
    supabase.from('calendar_events').select('id,title,start_date,start_datetime').eq('user_id', user.id).gte('start_date', today).order('start_date', { ascending: true }),
  ])

  const upcomingCalendar = (calendarEvents ?? []).filter((e: any) => {
    const t = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date)
    return t >= now
  })

  return { weather, latestGezondheid: gezondheid, foodLog: foodLog ?? [], settings, calendarEvents: upcomingCalendar }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSubtitle() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
}

// ─── Insight builders (one per category) ─────────────────────────────────────

function nutritionInsight(today: any): Insight | null {
  const foodLog = today?.foodLog ?? []
  const settings = today?.settings
  if (!settings || foodLog.length === 0) return null

  const totalProtein = foodLog.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(settings.macro_protein ?? 180)
  const pct = targetProtein > 0 ? totalProtein / targetProtein : 0
  const remaining = Math.max(0, targetProtein - totalProtein)

  // Project end-of-day pace (active window 6:00–24:00)
  const hour = new Date().getHours()
  const hoursElapsed = Math.max(1, hour - 6)
  const projected = Math.round(totalProtein * (18 / hoursElapsed))

  const status: InsightStatus = pct >= 0.9 ? 'good' : pct >= 0.5 ? 'warning' : 'alert'

  const explanation = pct >= 0.9
    ? 'Eiwitdoel bijna bereikt'
    : projected >= targetProtein
    ? `Op schema — nog ${Math.round(remaining)}g te gaan`
    : `Nog ${Math.round(remaining)}g te gaan — eet extra eiwit`

  return {
    id: 'nutrition',
    title: 'Eiwit',
    value: `${Math.round(totalProtein)}`,
    unit: `/ ${targetProtein}g`,
    status,
    explanation,
    trend: hour > 8 ? `Prognose: ~${Math.min(projected, Math.round(targetProtein * 1.1))}g einde dag` : undefined,
    href: '/food',
    priority: 20 + (1 - Math.min(pct, 1)) * 30,
  }
}

function trainingInsight(training: any): Insight | null {
  if (!training) return null

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))

  const allWorkouts = [
    ...(training.activities ?? []).map((a: any) => new Date(a.start_date)),
    ...(training.hevy ?? []).map((h: any) => new Date(h.start_time)),
  ].sort((a, b) => b.getTime() - a.getTime())

  if (allWorkouts.length === 0) {
    return {
      id: 'training',
      title: 'Training',
      value: '0',
      unit: 'sessies',
      status: 'alert',
      explanation: 'Geen recente training gevonden',
      href: '/training',
      priority: 35,
    }
  }

  const daysSince = Math.floor((now.getTime() - allWorkouts[0].getTime()) / 86400000)
  const weekCount = allWorkouts.filter(d => d >= weekStart).length
  const status: InsightStatus = daysSince <= 1 ? 'good' : daysSince <= 3 ? 'warning' : 'alert'

  const lastLabel = daysSince === 0 ? 'vandaag' : daysSince === 1 ? 'gisteren' : `${daysSince}d geleden`
  const explanation = daysSince === 0
    ? 'Al getraind vandaag — herstel staat centraal'
    : daysSince === 1
    ? 'Gisteren getraind — herstel loopt'
    : `${daysSince} dagen zonder training — plan een sessie`

  return {
    id: 'training',
    title: 'Training',
    value: `${weekCount}`,
    unit: 'sessies',
    status,
    explanation,
    trend: `Laatste: ${lastLabel}`,
    href: '/training',
    priority: 15 + (daysSince > 3 ? 22 : daysSince > 1 ? 5 : 0),
  }
}

function activityInsight(today: any): Insight | null {
  const stappen = today?.latestGezondheid?.stappen
  if (!stappen || stappen === 0) return null

  const stepGoal = 10000
  const pct = stappen / stepGoal
  const hour = new Date().getHours()
  const hoursElapsed = Math.max(1, hour - 6)
  const projected = Math.round(stappen * (18 / hoursElapsed))

  const status: InsightStatus = pct >= 1 ? 'good' : pct >= 0.6 ? 'warning' : 'alert'
  const explanation = pct >= 1
    ? 'Dagtarget bereikt — goed gedaan'
    : projected >= stepGoal
    ? `Op koers — nog ${(stepGoal - stappen).toLocaleString('nl-NL')} stappen`
    : `${(stepGoal - stappen).toLocaleString('nl-NL')} stappen tot dagtarget`

  return {
    id: 'activity',
    title: 'Stappen',
    value: stappen.toLocaleString('nl-NL'),
    unit: '',
    status,
    explanation,
    trend: hour > 8 && projected < stepGoal * 1.5 ? `Prognose: ~${projected.toLocaleString('nl-NL')}` : undefined,
    href: '/health/activity',
    priority: 10 + (pct < 0.5 && hour > 16 ? 18 : 0),
  }
}

function weightInsight(gezondheid: any[]): Insight | null {
  const withWeight = (gezondheid ?? []).filter((g: any) => g.gewicht && Number(g.gewicht) > 0)
  if (withWeight.length < 2) return null

  const latest = withWeight[0]
  const current = Number(latest.gewicht)

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
  const oldEntry = withWeight.find((g: any) => new Date(g.datum) <= sevenDaysAgo) ?? withWeight[withWeight.length - 1]
  const daysDiff = Math.max(1, (new Date(latest.datum).getTime() - new Date(oldEntry.datum).getTime()) / 86400000)
  const dailyDelta = (current - Number(oldEntry.gewicht)) / daysDiff
  const projected7 = current + dailyDelta * 7

  const trend = Math.abs(dailyDelta) < 0.02
    ? 'Gewicht stabiel'
    : dailyDelta < 0
    ? `↓ ${Math.abs(dailyDelta * 7).toFixed(1)}kg in 7 dagen verwacht`
    : `↑ ${(dailyDelta * 7).toFixed(1)}kg in 7 dagen verwacht`

  return {
    id: 'weight',
    title: 'Gewicht',
    value: current.toFixed(1),
    unit: 'kg',
    status: 'neutral',
    explanation: `Over 7 dagen: ~${projected7.toFixed(1)} kg`,
    trend,
    href: '/health/weight',
    priority: 10,
  }
}

function weatherInsight(weather: any): Insight | null {
  if (!weather) return null

  const temp = Math.round(Number(weather.temp))
  const wind = Math.round(Number(weather.windspeed))
  const code = Number(weather.weather_code)
  const precip = Number(weather.precipitation)
  const uv = Number(weather.uv_index_max)

  let status: InsightStatus = 'good'
  let explanation: string
  let priority = 5

  if (code >= 95) {
    status = 'alert'; priority = 30
    explanation = 'Onweer — geen buiten training vandaag'
  } else if (code >= 51 || precip > 2) {
    status = 'warning'; priority = 25
    explanation = `Regen (${precip}mm) — overweeg binnen te trainen`
  } else if (wind > 30) {
    status = 'warning'; priority = 22
    explanation = `Harde wind (${wind} km/u) — vermijd fietsen buiten`
  } else if (uv > 7) {
    status = 'warning'; priority = 12
    explanation = `Hoge UV — bescherm jezelf tussen 11:00–15:00`
  } else if (temp > 28) {
    status = 'warning'; priority = 12
    explanation = `Warm (${temp}°C) — train vroeg of 's avonds`
  } else {
    explanation = `${temp}°C — goede omstandigheden voor buiten`
  }

  return {
    id: 'weather',
    title: 'Weer',
    value: `${temp}°C`,
    unit: '',
    status,
    explanation,
    priority,
  }
}

function calendarInsight(calendarEvents: any[]): Insight | null {
  if (!calendarEvents?.length) return null

  const next = calendarEvents[0]
  const eventDate = next.start_datetime ? new Date(next.start_datetime) : new Date(next.start_date)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const dayAfter = new Date(tomorrow); dayAfter.setDate(tomorrow.getDate() + 1)

  const isToday = eventDate >= today && eventDate < tomorrow
  const isTomorrow = eventDate >= tomorrow && eventDate < dayAfter
  if (!isToday && !isTomorrow) return null

  const time = next.start_datetime
    ? new Date(next.start_datetime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : null

  return {
    id: 'calendar',
    title: 'Planning',
    value: time ?? (isToday ? 'Vandaag' : 'Morgen'),
    unit: '',
    status: 'neutral',
    explanation: next.title,
    trend: isToday ? 'Vandaag gepland' : 'Morgen gepland',
    href: `/training/session?title=${encodeURIComponent(next.title)}&time=${encodeURIComponent(next.start_datetime ?? '')}`,
    priority: isToday ? 24 : 14,
  }
}

function computeInsights(today: any, gezondheid: any[] | undefined, training: any): Insight[] {
  return [
    nutritionInsight(today),
    trainingInsight(training),
    activityInsight(today),
    weightInsight(gezondheid ?? []),
    weatherInsight(today?.weather),
    calendarInsight(today?.calendarEvents),
  ]
    .filter((c): c is Insight => c !== null)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4)
}

// ─── Daily briefing (state → reason → action) ─────────────────────────────────

function buildBriefing(insights: Insight[], today: any): string {
  if (insights.length === 0) {
    return 'Log je eerste maaltijd om gepersonaliseerde inzichten te activeren.'
  }

  const alerts = insights.filter(i => i.status === 'alert')
  const warnings = insights.filter(i => i.status === 'warning')

  // 1. Current state
  const state = alerts.length === 0 && warnings.length === 0
    ? 'Je ligt goed op schema vandaag'
    : alerts.length > 0
    ? `${alerts[0].title} vraagt aandacht`
    : 'Je bent op de goede weg'

  // 2. Main reason — highest-priority insight
  const reason = insights[0]?.explanation ?? ''

  // 3. Recommended action
  const target = alerts[0] ?? warnings[0]
  let action: string
  if (target?.id === 'nutrition') {
    const total = (today?.foodLog ?? []).reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
    const left = Math.round(Math.max(0, Number(today?.settings?.macro_protein ?? 180) - total))
    action = left > 10 ? `Focus op nog ${left}g eiwit voor optimaal herstel` : 'Eiwitdoel bijna bereikt'
  } else if (target?.id === 'training') {
    action = 'Plan vandaag of morgen een training'
  } else if (target) {
    action = target.explanation
  } else {
    const cal = (today?.calendarEvents ?? [])[0]
    action = cal ? `Geniet van ${cal.title} vandaag` : 'Blijf zo doorgaan'
  }

  const parts = [state, reason && reason !== action ? reason : null, action].filter(Boolean)
  return parts.join('. ') + '.'
}

// ─── Insight Card ─────────────────────────────────────────────────────────────

const STATUS_DOT: Record<InsightStatus, string> = {
  good: 'bg-teal-400',
  warning: 'bg-orange-400',
  alert: 'bg-red-400',
  neutral: 'bg-white/25',
}

function InsightCard({ insight }: { insight: Insight }) {
  const inner = (
    <div
      className="p-[18px] rounded-3xl border border-white/[0.09] flex flex-col gap-2 h-full"
      style={{ background: 'rgba(255,255,255,0.075)' }}
    >
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[insight.status]}`} />
        <span className="text-[12px] font-semibold text-white/40 uppercase tracking-[0.06em] leading-none">
          {insight.title}
        </span>
      </div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-[26px] font-bold text-white leading-none">{insight.value}</span>
        {insight.unit && (
          <span className="text-[13px] font-semibold text-white/40 leading-none">{insight.unit}</span>
        )}
      </div>
      <p className="text-[13px] text-white/55 leading-snug">{insight.explanation}</p>
      {insight.trend && (
        <span className="text-[12px] text-white/30 mt-auto pt-1">{insight.trend}</span>
      )}
    </div>
  )

  if (insight.href) {
    return (
      <a href={insight.href} className="block active:opacity-70 transition-opacity">
        {inner}
      </a>
    )
  }
  return inner
}

// ─── Daily Briefing Card ──────────────────────────────────────────────────────

function DailyBriefingCard({ text }: { text: string }) {
  return (
    <div
      className="p-5 rounded-[24px] border border-teal-400/20"
      style={{ background: 'rgba(45,212,191,0.07)' }}
    >
      <div className="flex items-start gap-3">
        <Sparkles size={17} className="text-teal-400 shrink-0 mt-0.5" />
        <p className="text-[15px] text-white/75 leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

// ─── Hero action card ─────────────────────────────────────────────────────────

const STRAVA_KEYWORDS = ['fietsen', 'ride', 'cycling', 'wielren', 'hardlopen', 'run', 'loop', 'duurloop', 'interval', 'tempoloop']

function HeroActionCard({ nextWorkout, tomorrowWorkout, showTrainingLink, proteinLeft }: {
  nextWorkout: { title: string; start_datetime: string | null } | null
  tomorrowWorkout: { title: string } | null
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

  const sleepAction = tomorrowWorkout
    ? `Sleep before 23:00 to be ready for ${tomorrowWorkout.title}`
    : 'Sleep before 23:00 to optimize recovery'

  const actions = [
    workoutLabel,
    proteinLeft > 10 ? `Eat ${Math.round(proteinLeft)}g protein to support recovery` : 'Protein goal reached ✓',
    sleepAction,
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const { data } = useSWR('today', fetchTodayData, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })

  const { data: gezondheid } = useSWR<any[]>('health-gezondheid', null)
  const { data: training } = useSWR<any>('training', null)

  const calendarEvents = data?.calendarEvents ?? []
  const nextWorkout = calendarEvents[0] ?? null

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  const tomorrowWorkout = calendarEvents.find((e: any) => e.start_date === tomorrowStr) ?? null

  const isStravaType = nextWorkout !== null &&
    STRAVA_KEYWORDS.some(k => nextWorkout.title.toLowerCase().includes(k))

  const totalProtein = (data?.foodLog ?? []).reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(data?.settings?.macro_protein ?? 180)
  const proteinLeft = Math.max(0, targetProtein - totalProtein)

  const insights = computeInsights(data, gezondheid, training)
  const briefing = buildBriefing(insights, data)

  return (
    <PremiumScreen title="Today" subtitle={formatSubtitle()}>

      <HeroActionCard
        nextWorkout={nextWorkout}
        tomorrowWorkout={tomorrowWorkout}
        showTrainingLink={isStravaType}
        proteinLeft={proteinLeft}
      />

      {briefing && <DailyBriefingCard text={briefing} />}

      {insights.length > 0 && (
        <>
          <SectionHeader title="Key Insights" />
          <div className="grid grid-cols-2 gap-3">
            {insights.map(insight => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </>
      )}

      <a
        href="/health"
        className="flex items-center justify-between px-[18px] py-[14px] rounded-2xl border border-white/[0.09]"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        <span className="text-[15px] font-semibold text-white/60">View All Metrics</span>
        <ChevronRight size={16} className="text-white/30" />
      </a>

    </PremiumScreen>
  )
}
