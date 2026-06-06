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

  const todayIso = `${today}T00:00:00`
  const [{ data: weather }, { data: gezondheid }, { data: foodLog }, { data: settings }, { data: calendarEvents }, { data: todayHevy }, { data: todayActivities }] = await Promise.all([
    supabase.from('weather_cache').select('*').eq('id', 'current').single(),
    supabase.from('gezondheid').select('stappen,gewicht,datum').eq('user_id', user.id).order('datum', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('food_log').select('kcal,protein,carbs,fat').eq('user_id', user.id).eq('date', today),
    supabase.from('user_settings').select('macro_kcal,macro_protein,macro_carbs,macro_fat,step_goal').eq('user_id', user.id).maybeSingle(),
    supabase.from('calendar_events').select('id,title,start_date,start_datetime').eq('user_id', user.id).gte('start_date', today).order('start_date', { ascending: true }),
    supabase.from('hevy_workouts').select('id,title,start_time').eq('user_id', user.id).gte('start_time', todayIso),
    supabase.from('strava_activities').select('id,name,sport_type,start_date').eq('user_id', user.id).gte('start_date', today),
  ])

  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)
  const sportKeywords = ['gym', 'run', 'loop', 'ride', 'fietsen', 'zwemmen', 'swim', 'voetbal', 'tennis', 'volleybal', 'training', 'workout', 'strength', 'push', 'pull', 'squat', 'toernooi', 'duurloop', 'interval', 'zone', 'sport', 'sporten', 'hardlopen', 'wielren', 'crossfit', 'yoga', 'padel', 'hockey', 'basketbal', 'wielrennen']
  const upcomingCalendar = (calendarEvents ?? []).filter((e: any) => {
    const t = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date)
    if (t < startOfToday) return false
    return sportKeywords.some(kw => e.title.toLowerCase().includes(kw))
  })

  return { weather, latestGezondheid: gezondheid, foodLog: foodLog ?? [], settings, calendarEvents: upcomingCalendar, todayHevy: todayHevy ?? [], todayActivities: todayActivities ?? [] }
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
  const surplus = Math.round(totalProtein - targetProtein)

  // Project end-of-day pace (active window 6:00–24:00)
  const hour = new Date().getHours()
  const hoursElapsed = Math.max(1, hour - 6)
  const projected = Math.round(totalProtein * (18 / hoursElapsed))

  let status: InsightStatus
  let explanation: string
  let trend: string | undefined

  if (pct >= 1.0) {
    status = 'good'
    explanation = 'Protein goal reached'
    trend = surplus > 0 ? `+${surplus}g above target` : undefined
  } else if (pct >= 0.85) {
    status = 'good'
    explanation = `${Math.round(remaining)}g to go — almost there`
    trend = hour > 8 ? `Projected: ~${Math.min(projected, Math.round(targetProtein * 1.1))}g end of day` : undefined
  } else if (pct >= 0.5) {
    status = 'warning'
    explanation = projected >= targetProtein
      ? `On track — ${Math.round(remaining)}g to go`
      : `${Math.round(remaining)}g to go — eat more protein`
    trend = hour > 8 ? `Projected: ~${Math.min(projected, Math.round(targetProtein * 1.1))}g end of day` : undefined
  } else {
    status = 'alert'
    explanation = `${Math.round(remaining)}g to go — protein intake behind schedule`
    trend = hour > 8 ? `Projected: ~${projected}g end of day` : undefined
  }

  return {
    id: 'nutrition',
    title: 'Protein',
    value: `${Math.round(totalProtein)}`,
    unit: `/ ${targetProtein}g`,
    status,
    explanation,
    trend,
    href: '/food',
    priority: 75 + (1 - Math.min(pct, 1)) * 20,
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
      title: 'Training Momentum',
      value: 'No data',
      unit: '',
      status: 'alert',
      explanation: 'No recent training found',
      href: '/training',
      priority: 65,
    }
  }

  const daysSince = Math.floor((now.getTime() - allWorkouts[0].getTime()) / 86400000)
  const weekCount = allWorkouts.filter(d => d >= weekStart).length
  const status: InsightStatus = daysSince <= 1 ? 'good' : daysSince <= 3 ? 'warning' : 'alert'

  const momentumLabel =
    daysSince === 0 ? 'Active today'
    : weekCount >= 3 ? 'Strong rhythm'
    : weekCount >= 2 && daysSince <= 2 ? 'On track'
    : daysSince === 1 ? 'Good recovery'
    : `${daysSince}d rest`

  const explanation =
    daysSince === 0 ? 'Already trained today — focus on recovery'
    : daysSince === 1 ? 'Trained yesterday — recovery on track'
    : weekCount >= 3 ? `${weekCount} sessions this week — great consistency`
    : daysSince <= 3 ? `${daysSince} days without training`
    : `${daysSince} days without training — plan a session`

  const lastLabel = daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`

  return {
    id: 'training',
    title: 'Training Momentum',
    value: momentumLabel,
    unit: '',
    status,
    explanation,
    trend: `Last workout: ${lastLabel}`,
    href: '/training',
    priority: status === 'alert' ? 65 : status === 'warning' ? 50 : 40,
  }
}

function activityInsight(today: any): Insight | null {
  const stappen = today?.latestGezondheid?.stappen
  if (!stappen || stappen === 0) return null

  const stepGoal = Number(today?.settings?.step_goal ?? 10000)
  const pct = stappen / stepGoal
  const hour = new Date().getHours()
  const hoursElapsed = Math.max(1, hour - 6)
  const projected = Math.round(stappen * (18 / hoursElapsed))

  const status: InsightStatus = pct >= 1 ? 'good' : pct >= 0.6 ? 'warning' : 'alert'
  const explanation = pct >= 1
    ? 'Daily goal reached — great job'
    : projected >= stepGoal
    ? `On track — ${(stepGoal - stappen).toLocaleString('en')} steps to go`
    : `${(stepGoal - stappen).toLocaleString('en')} steps to daily goal`

  return {
    id: 'activity',
    title: 'Steps',
    value: stappen.toLocaleString('en'),
    unit: '',
    status,
    explanation,
    trend: hour > 8 && projected < stepGoal * 1.5 ? `Projected: ~${projected.toLocaleString('en')}` : undefined,
    href: '/health/activity',
    priority: status === 'alert' ? 45 : status === 'warning' ? 35 : 25,
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
    ? 'Weight stable'
    : dailyDelta < 0
    ? `↓ ${Math.abs(dailyDelta * 7).toFixed(1)}kg expected in 7 days`
    : `↑ ${(dailyDelta * 7).toFixed(1)}kg expected in 7 days`

  return {
    id: 'weight',
    title: 'Weight',
    value: current.toFixed(1),
    unit: 'kg',
    status: 'neutral',
    explanation: `In 7 days: ~${projected7.toFixed(1)} kg`,
    trend,
    href: '/health/weight',
    priority: 55,
  }
}

function weatherInsight(weather: any): Insight | null {
  if (!weather) return null

  const temp = Math.round(Number(weather.temp))
  const wind = Math.round(Number(weather.windspeed))
  const code = Number(weather.weather_code)
  const precip = Number(weather.precipitation)
  const uv = Number(weather.uv_index_max)

  // Only surface weather when it has meaningful impact on training
  const hasImpact = code >= 95 || precip > 3 || wind > 25 || temp > 28 || temp < 0 || uv > 7
  if (!hasImpact) return null

  let status: InsightStatus = 'warning'
  let explanation: string

  if (code >= 95) {
    status = 'alert'
    explanation = 'Thunderstorm — skip outdoor training today'
  } else if (precip > 3) {
    explanation = `Rain (${precip}mm) — consider training indoors`
  } else if (wind > 25) {
    explanation = `Strong wind (${wind} km/h) — avoid cycling outdoors`
  } else if (temp < 0) {
    explanation = `Freezing (${temp}°C) — warm up well before training`
  } else if (temp > 28) {
    explanation = `Hot (${temp}°C) — train early or in the evening`
  } else {
    explanation = `High UV — protect yourself between 11:00–15:00`
  }

  return {
    id: 'weather',
    title: 'Weather',
    value: `${temp}°C`,
    unit: '',
    status,
    explanation,
    priority: 20,
  }
}

function calendarInsight(calendarEvents: any[], todayHevy: any[], todayActivities: any[]): Insight | null {
  if (!calendarEvents?.length) return null

  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate() + 1)
  const dayAfterStart = new Date(tomorrowStart); dayAfterStart.setDate(tomorrowStart.getDate() + 1)

  const strengthKw = ['pull', 'push', 'legs', 'chest', 'back', 'squat', 'gym', 'strength', 'deadlift', 'bench', 'bicep', 'tricep', 'shoulder', 'upper', 'lower']
  const cardioKw = ['run', 'loop', 'fietsen', 'zwemmen', 'swim', 'ride', 'cycling', 'hardlopen', 'wielren', 'duurloop', 'interval']

  function hasWorkedOut(title: string): boolean {
    const t = title.toLowerCase()
    const isStrength = strengthKw.some(kw => t.includes(kw))
    const isCardio = cardioKw.some(kw => t.includes(kw))
    if (isStrength && !isCardio) return todayHevy.length > 0
    if (isCardio && !isStrength) return todayActivities.length > 0
    return todayHevy.length > 0 || todayActivities.length > 0
  }

  const todayEvents = calendarEvents.filter(e => {
    const d = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date)
    return d >= todayStart && d < tomorrowStart
  })
  const tomorrowEvents = calendarEvents.filter(e => {
    const d = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date)
    return d >= tomorrowStart && d < dayAfterStart
  })

  // Prioriteer: vandaag niet gedaan → vandaag gedaan → morgen
  const uncompletedToday = todayEvents.filter(e => !hasWorkedOut(e.title))
  const next = uncompletedToday[0] ?? todayEvents[0] ?? tomorrowEvents[0]
  if (!next) return null

  const eventDate = next.start_datetime ? new Date(next.start_datetime) : new Date(next.start_date)
  const isToday = eventDate >= todayStart && eventDate < tomorrowStart
  const workedOut = isToday && hasWorkedOut(next.title)
  const time = next.start_datetime
    ? new Date(next.start_datetime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null

  let trend: string
  let status: InsightStatus
  let explanation: string

  if (workedOut) {
    status = 'good'
    trend = 'Completed today ✓'
    explanation = time ? `Trained — was scheduled at ${time}` : 'Completed today'
  } else if (isToday && next.start_datetime && eventDate > now) {
    status = 'neutral'
    const msUntil = eventDate.getTime() - now.getTime()
    const h = Math.floor(msUntil / 3600000)
    const m = Math.floor((msUntil % 3600000) / 60000)
    trend = h > 0 ? `In ${h}h ${m}m` : `In ${m}m`
    explanation = `Scheduled at ${time}`
  } else if (isToday) {
    status = 'warning'
    trend = 'Still to do'
    explanation = time ? `Was planned at ${time}` : 'Planned for today'
  } else {
    status = 'neutral'
    trend = 'Planned tomorrow'
    explanation = time ? `Scheduled at ${time}` : 'Tomorrow'
  }

  return {
    id: 'calendar',
    title: 'Training',
    value: next.title,
    unit: '',
    status,
    explanation,
    trend,
    href: `/training/session?title=${encodeURIComponent(next.title)}&time=${encodeURIComponent(next.start_datetime ?? '')}`,
    priority: isToday && !workedOut ? 100 : isToday && workedOut ? 70 : 65,
  }
}

function computeInsights(today: any, gezondheid: any[] | undefined, training: any): Insight[] {
  return [
    nutritionInsight(today),
    trainingInsight(training),
    activityInsight(today),
    weightInsight(gezondheid ?? []),
    weatherInsight(today?.weather),
    calendarInsight(today?.calendarEvents ?? [], today?.todayHevy ?? [], today?.todayActivities ?? []),
  ]
    .filter((c): c is Insight => c !== null)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4)
}

// ─── Daily briefing (state → reason → action) ─────────────────────────────────

function buildBriefing(insights: Insight[], today: any): string {
  if (insights.length === 0) return ''

  const calI = insights.find(i => i.id === 'calendar')
  const nutriI = insights.find(i => i.id === 'nutrition')
  const trainI = insights.find(i => i.id === 'training')
  const weatherI = insights.find(i => i.id === 'weather')

  const foodLog = today?.foodLog ?? []
  const totalProtein = foodLog.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(today?.settings?.macro_protein ?? 180)
  const proteinLeft = Math.round(Math.max(0, targetProtein - totalProtein))
  const proteinAchieved = totalProtein >= targetProtein

  const nextEvent = (today?.calendarEvents ?? [])[0]
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate() + 1)
  const dayAfterStart = new Date(tomorrowStart); dayAfterStart.setDate(tomorrowStart.getDate() + 1)
  const nextEventDate = nextEvent?.start_datetime ? new Date(nextEvent.start_datetime) : nextEvent ? new Date(nextEvent.start_date) : null
  const nextIsToday = nextEventDate ? nextEventDate >= todayStart && nextEventDate < tomorrowStart : false
  const nextIsTomorrow = nextEventDate ? nextEventDate >= tomorrowStart && nextEventDate < dayAfterStart : false

  // Collect positive facts for state sentence
  const positives: string[] = []
  if (proteinAchieved) positives.push('protein goal already reached')
  if (trainI?.status === 'good') positives.push('training week is going well')

  // Collect what needs attention
  const needsAttention: string[] = []
  if (!proteinAchieved && nutriI?.status === 'alert') needsAttention.push(`protein intake behind (${proteinLeft}g to go)`)
  if (trainI?.status === 'alert') needsAttention.push("you haven't trained in a while")
  if (weatherI) needsAttention.push(weatherI.explanation.toLowerCase())

  // 1. State sentence
  let state: string
  if (needsAttention.length > 0) {
    const item = needsAttention[0]
    state = item.charAt(0).toUpperCase() + item.slice(1)
  } else if (positives.length >= 2) {
    state = positives.slice(0, -1).join(', ') + ' and ' + positives[positives.length - 1]
    state = state.charAt(0).toUpperCase() + state.slice(1)
  } else if (positives.length === 1) {
    state = positives[0].charAt(0).toUpperCase() + positives[0].slice(1)
  } else {
    state = "You're on track today"
  }

  // 2. Action sentence
  let action: string
  if (!proteinAchieved && nutriI && proteinLeft > 15) {
    action = `Focus on ${proteinLeft}g more protein for optimal recovery`
  } else if (trainI?.status === 'alert') {
    action = 'Plan a workout today or tomorrow to stay on track'
  } else if (nextIsToday && nextEvent) {
    const t = nextEvent.start_datetime
      ? new Date(nextEvent.start_datetime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : null
    action = t ? `Prepare for ${nextEvent.title} at ${t}` : `Prepare for ${nextEvent.title} today`
  } else if (nextIsTomorrow && nextEvent) {
    action = `Focus on recovery to be ready for ${nextEvent.title} tomorrow`
  } else if (!proteinAchieved && proteinLeft > 10) {
    action = `Eat ${proteinLeft}g more protein before end of day`
  } else {
    action = 'Stay consistent and enjoy the day'
  }

  return `${state}. ${action}.`
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
      <div className="flex items-baseline gap-1 mt-0.5 flex-wrap">
        <span className={`font-bold text-white leading-tight ${insight.value.length > 10 ? 'text-[18px]' : insight.value.length > 6 ? 'text-[22px]' : 'text-[26px]'}`}>
          {insight.value}
        </span>
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
