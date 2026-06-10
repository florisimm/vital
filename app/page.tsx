'use client'

import useSWR from 'swr'
import { Sparkles } from 'lucide-react'
import { PremiumScreen } from '@/components/PremiumScreen'
import { SectionHeader } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import { computePhysiologyReadiness, computeHRVBaseline, computeSleepScore, type HealthRow } from '@/lib/readiness'

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
    const t = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date + 'T00:00:00')
    if (t < startOfToday) return false
    return sportKeywords.some(kw => e.title.toLowerCase().includes(kw))
  })

  return { weather, latestGezondheid: gezondheid, foodLog: foodLog ?? [], settings, calendarEvents: upcomingCalendar, todayHevy: todayHevy ?? [], todayActivities: todayActivities ?? [] }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSubtitle() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
}

// ─── Insight builders ─────────────────────────────────────────────────────────

function nutritionInsight(today: any): Insight | null {
  const foodLog = today?.foodLog ?? []
  const settings = today?.settings
  if (!settings || foodLog.length === 0) return null

  const totalProtein = foodLog.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(settings.macro_protein ?? 180)
  const pct = targetProtein > 0 ? totalProtein / targetProtein : 0
  const remaining = Math.max(0, targetProtein - totalProtein)
  const surplus = Math.round(totalProtein - targetProtein)

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

function kcalInsight(today: any): Insight | null {
  const foodLog = today?.foodLog ?? []
  const settings = today?.settings
  if (!settings || foodLog.length === 0) return null

  const totalKcal = Math.round(foodLog.reduce((s: number, f: any) => s + Number(f.kcal ?? 0), 0))
  const targetKcal = Number(settings.macro_kcal ?? 2000)
  if (targetKcal <= 0) return null

  const pct = totalKcal / targetKcal
  const remaining = Math.max(0, targetKcal - totalKcal)
  const surplus = Math.round(totalKcal - targetKcal)

  let status: InsightStatus
  let explanation: string

  if (pct >= 1.15) {
    status = 'warning'
    explanation = `${surplus} kcal over target`
  } else if (pct >= 0.9) {
    status = 'good'
    explanation = 'Calorie goal on track'
  } else if (pct >= 0.5) {
    status = 'warning'
    explanation = `${Math.round(remaining)} kcal to go`
  } else {
    status = 'alert'
    explanation = `Well below target — eat more`
  }

  return {
    id: 'kcal',
    title: 'Calories',
    value: String(totalKcal),
    unit: `/ ${targetKcal}`,
    status,
    explanation,
    trend: `${Math.round(pct * 100)}% of daily goal`,
    href: '/food',
    priority: 60,
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

function weatherInsight(weather: any): Insight | null {
  if (!weather) return null

  const temp = Math.round(Number(weather.temp))
  const wind = Math.round(Number(weather.windspeed))
  const code = Number(weather.weather_code)
  const precip = Number(weather.precipitation)
  const uv = Number(weather.uv_index_max)

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
    priority: status === 'alert' ? 90 : 20,
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

  const parseEventDate = (e: any) => e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date + 'T00:00:00')

  const todayEvents = calendarEvents.filter(e => { const d = parseEventDate(e); return d >= todayStart && d < tomorrowStart })
  const tomorrowEvents = calendarEvents.filter(e => { const d = parseEventDate(e); return d >= tomorrowStart && d < dayAfterStart })

  const uncompletedToday = todayEvents.filter(e => !hasWorkedOut(e.title))
  const next = uncompletedToday[0] ?? todayEvents[0] ?? tomorrowEvents[0]
  if (!next) return null

  const eventDate = parseEventDate(next)
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
  const cal = calendarInsight(today?.calendarEvents ?? [], today?.todayHevy ?? [], today?.todayActivities ?? [])
  return [
    nutritionInsight(today),
    kcalInsight(today),
    // Training momentum only when no calendar event — avoids showing the same info twice
    cal ? null : trainingInsight(training),
    activityInsight(today),
    // Weather at high priority when severe (thunderstorm), otherwise low
    weatherInsight(today?.weather),
    cal,
  ]
    .filter((c): c is Insight => c !== null)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4)
}

// ─── Daily briefing — synthesises signals not shown in the insight cards ───────

function buildBriefing(insights: Insight[], today: any, rows: HealthRow[]): string {
  const readiness = computePhysiologyReadiness(rows)
  const latestSleep = rows.find(r => r.slaap_minuten != null)
  const sleepScore = latestSleep ? computeSleepScore(latestSleep) : null
  const hrvBaseline = computeHRVBaseline(rows)

  // Build signal description from multi-source health data
  const signalParts: string[] = []
  if (sleepScore !== null) {
    if (sleepScore < 55) signalParts.push('poor sleep')
    else if (sleepScore >= 80) signalParts.push('good sleep')
  }
  if (hrvBaseline.deviationPct !== null) {
    if (hrvBaseline.deviationPct <= -15) signalParts.push(`HRV ${Math.abs(hrvBaseline.deviationPct)}% below baseline`)
    else if (hrvBaseline.deviationPct >= 10) signalParts.push(`HRV ${hrvBaseline.deviationPct}% above baseline`)
  }

  const calI = insights.find(i => i.id === 'calendar')
  const workoutName = calI?.value ?? null
  const workoutDone = calI?.trend?.includes('Completed') ?? false

  // Health-data path — synthesises sleep + HRV + readiness into one statement
  if (readiness.score !== null) {
    if (readiness.score >= 75) {
      const prefix = signalParts.length ? `${signalParts.join(' and ')} — ` : ''
      if (workoutName && !workoutDone) {
        return `${prefix.charAt(0).toUpperCase() + prefix.slice(1)}Recovery is strong. Push hard in ${workoutName} today.`
      }
      return `${prefix.charAt(0).toUpperCase() + prefix.slice(1)}Recovery markers are strong. A quality session is well-supported today.`
    }
    if (readiness.score >= 50) {
      const prefix = signalParts.length ? `${signalParts.join(' and ')} — m` : 'M'
      return `${prefix}oderate readiness. Zone 2 work and solid nutrition will bring you to full readiness.`
    }
    const reasons = signalParts.length ? ` (${signalParts.join(', ')})` : ''
    return `Recovery is low${reasons}. Keep today easy and prioritise sleep and protein.`
  }

  // Fallback: no Fitbit data — use calendar + nutrition signals
  const foodLog = today?.foodLog ?? []
  const totalProtein = foodLog.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(today?.settings?.macro_protein ?? 180)
  const proteinLeft = Math.round(Math.max(0, targetProtein - totalProtein))

  if (workoutName && !workoutDone) {
    if (proteinLeft > 30) return `${workoutName} is coming up. Front-load ${proteinLeft}g protein before training for better performance.`
    return `${workoutName} is coming up. Nutrition is on track — focus on executing the session.`
  }

  if (proteinLeft > 40) return `Protein intake is behind schedule. Aim for ${proteinLeft}g more before end of day.`
  return "You're on track today. Stay consistent and enjoy the day."
}

// ─── Vitals row ───────────────────────────────────────────────────────────────

function VitalTile({ label, value, note, color, href }: {
  label: string; value: string; note: string; color: string; href: string
}) {
  return (
    <a
      href={href}
      className="flex flex-col gap-1.5 px-3 py-3 rounded-[18px] border border-white/[0.09] active:opacity-70 transition-opacity"
      style={{ background: 'rgba(255,255,255,0.05)' }}
    >
      <span className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.08em]">{label}</span>
      <span className="text-[22px] font-bold text-white leading-none">{value}</span>
      <span className="text-[11px] font-semibold leading-none" style={{ color }}>{note}</span>
    </a>
  )
}

function VitalsRow({ rows }: { rows: HealthRow[] }) {
  const readiness   = computePhysiologyReadiness(rows)
  const latestSleep = rows.find(r => r.slaap_minuten != null)
  const sleepScore  = latestSleep ? computeSleepScore(latestSleep) : null
  const hrv         = rows.find(r => r.hrv_rmssd != null)?.hrv_rmssd ?? null
  const hrvBaseline = computeHRVBaseline(rows)

  const sleepLabel = sleepScore === null ? '–' : sleepScore >= 80 ? 'Good' : sleepScore >= 60 ? 'Fair' : 'Poor'
  const sleepColor = sleepScore === null ? 'rgba(255,255,255,0.3)'
    : sleepScore >= 80 ? '#4ade80' : sleepScore >= 60 ? '#fb923c' : '#f87171'

  const hrvNote = hrvBaseline.deviationPct !== null
    ? `${hrvBaseline.deviationPct > 0 ? '+' : ''}${hrvBaseline.deviationPct}% baseline`
    : 'ms'
  const hrvColor = hrvBaseline.deviationPct === null ? 'rgba(255,255,255,0.3)'
    : hrvBaseline.deviationPct >= -5 ? '#4ade80' : '#fb923c'

  // One-line context: driven by the weakest signal
  const context = (() => {
    if (readiness.score === null) return null
    if (readiness.score < 45) return 'Recovery is low — keep today easy'
    if (sleepScore !== null && sleepScore < 55) return 'Poor sleep — avoid high intensity'
    if (hrvBaseline.deviationPct !== null && hrvBaseline.deviationPct < -15) return 'HRV below baseline — train light'
    if (readiness.score >= 80) return 'Strong recovery — push hard today'
    return null
  })()

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <VitalTile label="Readiness" value={readiness.score !== null ? String(readiness.score) : '–'} note={readiness.label} color={readiness.color} href="/health/recovery" />
        <VitalTile label="Sleep" value={sleepScore !== null ? String(sleepScore) : '–'} note={sleepLabel} color={sleepColor} href="/health/sleep" />
        <VitalTile label="HRV" value={hrv !== null ? String(Math.round(hrv)) : '–'} note={hrvNote} color={hrvColor} href="/health/heart" />
      </div>
      {context && (
        <p className="text-[13px] text-white/40 px-1">{context}</p>
      )}
    </div>
  )
}

// ─── Macro progress ───────────────────────────────────────────────────────────

function MacroBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(current / target, 1) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.06em]">{label}</span>
        <span className="text-[11px] text-white/40">{Math.round(current)}<span className="text-white/25">/{target}</span></span>
      </div>
      <div className="h-[4px] rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
    </div>
  )
}

function MacroProgress({ today }: { today: any }) {
  const foodLog = today?.foodLog ?? []
  const settings = today?.settings
  if (!settings || foodLog.length === 0) return null

  const t = foodLog.reduce((s: any, f: any) => ({
    kcal:    s.kcal    + Number(f.kcal    ?? 0),
    protein: s.protein + Number(f.protein ?? 0),
    carbs:   s.carbs   + Number(f.carbs   ?? 0),
    fat:     s.fat     + Number(f.fat     ?? 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })

  return (
    <a
      href="/food"
      className="flex flex-col gap-3 px-4 py-3.5 rounded-[20px] border border-white/[0.09] active:opacity-70 transition-opacity"
      style={{ background: 'rgba(255,255,255,0.05)' }}
    >
      <MacroBar label="Kcal"    current={t.kcal}    target={Number(settings.macro_kcal    ?? 2000)} color="rgb(251,146,60)"  />
      <MacroBar label="Protein" current={t.protein} target={Number(settings.macro_protein ?? 180)}  color="rgb(45,212,191)"  />
      <MacroBar label="Carbs"   current={t.carbs}   target={Number(settings.macro_carbs   ?? 250)}  color="rgb(163,230,53)"  />
      <MacroBar label="Fat"     current={t.fat}     target={Number(settings.macro_fat     ?? 70)}   color="rgb(250,204,21)"  />
    </a>
  )
}

// ─── Status dot ───────────────────────────────────────────────────────────────

const STATUS_DOT: Record<InsightStatus, string> = {
  good:    'bg-teal-400',
  warning: 'bg-orange-400',
  alert:   'bg-red-400',
  neutral: 'bg-white/25',
}

// ─── Insight card ─────────────────────────────────────────────────────────────

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

// ─── Daily briefing card ──────────────────────────────────────────────────────

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

function HeroActionCard({ todayWorkout, todayWorkoutDone, tomorrowWorkout, workoutTimePassed = false, isTomorrow = false, readinessScore }: {
  todayWorkout: { title: string; start_datetime: string | null } | null
  todayWorkoutDone: boolean
  tomorrowWorkout: { title: string } | null
  workoutTimePassed?: boolean
  isTomorrow?: boolean
  readinessScore?: number | null
}) {
  const workoutLabel = todayWorkout
    ? (() => {
        const t = todayWorkout.start_datetime ? new Date(todayWorkout.start_datetime) : null
        const time = t ? t.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : null
        const base = time ? `${todayWorkout.title} at ${time}` : todayWorkout.title
        if (todayWorkoutDone) return `${base} ✓`
        if (workoutTimePassed) return `Still to do — ${todayWorkout.title}`
        if (isTomorrow) return `Tomorrow: ${base}`
        return base
      })()
    : 'No workout planned today'

  const showTomorrow = tomorrowWorkout && (todayWorkoutDone || !todayWorkout)
  const isOverdue = workoutTimePassed && !todayWorkoutDone && !!todayWorkout

  // Sleep tip only surfaces late evening when recovery is actually low
  const hour = new Date().getHours()
  const showSleepTip = hour >= 21 && readinessScore != null && readinessScore < 70
  const sleepAction = tomorrowWorkout
    ? `Sleep before 23:00 to be ready for ${tomorrowWorkout.title}`
    : 'Sleep before 23:00 to optimize recovery'

  const actions = [
    { label: workoutLabel, done: todayWorkoutDone && !!todayWorkout, overdue: isOverdue },
    ...(showTomorrow ? [{ label: `Tomorrow: ${tomorrowWorkout!.title}`, done: false, overdue: false }] : []),
    ...(showSleepTip  ? [{ label: sleepAction,                         done: false, overdue: false }] : []),
  ]

  const hasUnfinishedWorkout = todayWorkout !== null && !todayWorkoutDone
  const isStravaWorkout = hasUnfinishedWorkout && STRAVA_KEYWORDS.some(k => todayWorkout!.title.toLowerCase().includes(k))
  const workoutHref = todayWorkout
    ? (isStravaWorkout ? `/training/session?title=${encodeURIComponent(todayWorkout.title)}&time=${encodeURIComponent(todayWorkout.start_datetime ?? '')}` : '/training')
    : '/training'

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
            <div className={`w-[7px] h-[7px] rounded-full shrink-0 ${a.done ? 'bg-teal-400' : a.overdue ? 'bg-orange-400' : 'bg-white'}`} />
            <span className={`text-[20px] font-semibold leading-tight ${a.done ? 'text-white/50' : 'text-white'}`}>{a.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {hasUnfinishedWorkout && (
          <a
            href={workoutHref}
            className="flex items-center justify-center w-full h-[54px] rounded-[18px] bg-white text-black font-semibold text-[16px]"
          >
            Start training →
          </a>
        )}
        <a
          href="/food"
          className={`flex items-center justify-center w-full h-[54px] rounded-[18px] font-semibold text-[16px] ${
            hasUnfinishedWorkout
              ? 'border border-white/20 text-white/70'
              : 'bg-white text-black'
          }`}
        >
          Log food
        </a>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const { data } = useSWR('today', fetchTodayData, {
    revalidateOnFocus: true,
    revalidateOnMount: true,
    dedupingInterval: 60_000,
  })

  const { data: gezondheid } = useSWR<HealthRow[]>('health-gezondheid', null)
  const { data: training }   = useSWR<any>('training', null)

  const calendarEvents = data?.calendarEvents ?? []
  const now = new Date()
  const todayStart    = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate() + 1)

  const parseDate = (e: any) => e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date + 'T00:00:00')
  const todayEvents    = calendarEvents.filter((e: any) => { const d = parseDate(e); return d >= todayStart && d < tomorrowStart })
  const tomorrowEvents = calendarEvents.filter((e: any) => parseDate(e) >= tomorrowStart)

  const tomorrowWorkout = tomorrowEvents[0] ?? null

  const strengthKw = ['pull', 'push', 'legs', 'chest', 'back', 'squat', 'gym', 'strength', 'deadlift', 'bench', 'bicep', 'tricep', 'shoulder', 'upper', 'lower']
  const cardioKw   = ['run', 'loop', 'fietsen', 'zwemmen', 'swim', 'ride', 'cycling', 'hardlopen', 'wielren', 'duurloop', 'interval']
  const CARDIO_SPORT_TYPES = ['run', 'ride', 'swim', 'walk', 'hike', 'virtual_run', 'virtual_ride', 'rowing', 'kayaking', 'crossfit', 'elliptical']

  function isEventDone(title: string): boolean {
    const t = title.toLowerCase()
    const isStrength = strengthKw.some(kw => t.includes(kw))
    const isCardio   = cardioKw.some(kw => t.includes(kw))
    const hevy = data?.todayHevy ?? []
    const acts = data?.todayActivities ?? []
    const cardioActs = acts.filter((a: any) => CARDIO_SPORT_TYPES.some(ct => (a.sport_type ?? '').toLowerCase().includes(ct)))
    if (isStrength && !isCardio) return hevy.length > 0
    if (isCardio && !isStrength)  return cardioActs.length > 0
    return hevy.length > 0 || cardioActs.length > 0
  }

  const firstUndone  = todayEvents.find((e: any) => !isEventDone(e.title)) ?? null
  const allTodayDone = todayEvents.length > 0 && firstUndone === null

  const actualToday = todayEvents.length === 0
    ? ((data?.todayHevy ?? []).length > 0
        ? { title: (data!.todayHevy as any[])[0].title as string, start_datetime: (data!.todayHevy as any[])[0].start_time as string }
        : (data?.todayActivities ?? []).length > 0
          ? { title: (data!.todayActivities as any[])[0].name as string, start_datetime: (data!.todayActivities as any[])[0].start_date as string }
          : null)
    : null

  const workoutTimePassed = firstUndone?.start_datetime ? new Date(firstUndone.start_datetime) < now : false

  const displayWorkout     = firstUndone ?? (allTodayDone ? tomorrowWorkout : actualToday)
  const displayWorkoutDone = !firstUndone && !allTodayDone && actualToday !== null
  const displayTomorrow    = allTodayDone ? null : tomorrowWorkout
  const displayIsTomorrow  = allTodayDone && !!tomorrowWorkout

  const rows = gezondheid ?? []
  const readiness = computePhysiologyReadiness(rows)

  const insights = computeInsights(data, gezondheid, training)
  const briefing = buildBriefing(insights, data, rows)

  return (
    <PremiumScreen title="Today" subtitle={formatSubtitle()}>

      {/* 1. Briefing — sets the tone for the day */}
      {briefing && <DailyBriefingCard text={briefing} />}

      {/* 2. Vitals — health data behind the briefing, clickable to detail */}
      {rows.length > 0 && <VitalsRow rows={rows} />}

      {/* 3. Hero — today's concrete actions */}
      <HeroActionCard
        todayWorkout={displayWorkout}
        todayWorkoutDone={displayWorkoutDone}
        tomorrowWorkout={displayTomorrow}
        workoutTimePassed={workoutTimePassed}
        isTomorrow={displayIsTomorrow}
        readinessScore={readiness.score}
      />

      {/* 4. Macro progress — daily nutrition at a glance, links to food tab */}
      <MacroProgress today={data} />

      {/* 5. Key insights — trends and context */}
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

    </PremiumScreen>
  )
}
