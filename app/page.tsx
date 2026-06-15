'use client'

import { useEffect } from 'react'
import useSWR, { mutate } from 'swr'
import { createClient } from '@/lib/supabase'
import { PremiumScreen } from '@/components/PremiumScreen'
import { computePhysiologyReadiness, computeHRVBaseline, computeSleepScore, type HealthRow } from '@/lib/readiness'
import { formatTime, localDateStr } from '@/lib/timeFormat'

// ─── Constants ────────────────────────────────────────────────────────────────

const STRENGTH_KW = ['pull', 'push', 'legs', 'chest', 'back', 'squat', 'gym', 'strength', 'deadlift', 'bench', 'bicep', 'tricep', 'shoulder', 'upper', 'lower', 'gewichten', 'kracht']
const CARDIO_KW   = ['run', 'loop', 'fietsen', 'zwemmen', 'swim', 'ride', 'cycling', 'hardlopen', 'wielren', 'duurloop', 'interval', 'tempoloop', 'zone']
const CARDIO_SPORT_TYPES = ['run', 'ride', 'swim', 'walk', 'hike', 'virtual_run', 'virtual_ride', 'rowing', 'kayaking', 'crossfit', 'elliptical']
const SPORT_KW = [...new Set([...STRENGTH_KW, ...CARDIO_KW, 'voetbal', 'tennis', 'volleybal', 'training', 'workout', 'toernooi', 'sport', 'sporten', 'crossfit', 'yoga', 'padel', 'hockey', 'basketbal', 'wielrennen'])]

type DayStatus = 'green' | 'yellow' | 'red'

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchTodayData() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const now   = new Date()
  const today = localDateStr(now)
  const todayIso = `${today}T00:00:00`
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = localDateStr(sevenDaysAgo)

  const [
    { data: latestGezondheid },
    { data: foodLogToday },
    { data: foodLog7d },
    { data: settings },
    { data: calendarEvents },
    { data: todayHevy },
    { data: todayActivities },
  ] = await Promise.all([
    supabase.from('gezondheid').select('stappen,gewicht,datum').eq('user_id', user.id).eq('datum', today).maybeSingle(),
    supabase.from('food_log').select('kcal,protein,carbs,fat').eq('user_id', user.id).eq('date', today),
    supabase.from('food_log').select('date,protein').eq('user_id', user.id).gte('date', sevenDaysAgoStr).order('date', { ascending: false }),
    supabase.from('user_settings').select('macro_kcal,macro_protein,macro_carbs,macro_fat,step_goal').eq('user_id', user.id).maybeSingle(),
    supabase.from('calendar_events').select('id,title,start_date,start_datetime,end_datetime').eq('user_id', user.id).gte('start_date', today).order('start_date', { ascending: true }),
    supabase.from('hevy_workouts').select('id,title,start_time').eq('user_id', user.id).gte('start_time', todayIso),
    supabase.from('strava_activities').select('id,name,sport_type,start_date').eq('user_id', user.id).gte('start_date', today),
  ])

  return {
    latestGezondheid,
    foodLogToday:   foodLogToday   ?? [],
    foodLog7d:      foodLog7d      ?? [],
    settings,
    calendarEvents: calendarEvents ?? [],
    todayHevy:      todayHevy      ?? [],
    todayActivities: todayActivities ?? [],
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSubtitle() {
  const s = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.toUpperCase()
}

function fmtTime(dt: string | null): string | null {
  if (!dt) return null
  return formatTime(dt)
}

function tod0(): Date { const d = new Date(); d.setHours(0,0,0,0); return d }
function tom0(): Date { const d = tod0(); d.setDate(d.getDate()+1); return d }

function isToday(e: any): boolean {
  const d = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date + 'T00:00:00')
  return d >= tod0() && d < tom0()
}

function isSport(e: any): boolean {
  return SPORT_KW.some(kw => e.title.toLowerCase().includes(kw))
}

function workoutDone(title: string, hevy: any[], acts: any[]): boolean {
  const t    = title.toLowerCase()
  const str  = STRENGTH_KW.some(k => t.includes(k))
  const car  = CARDIO_KW.some(k => t.includes(k))
  const cardioActs = acts.filter((a: any) => CARDIO_SPORT_TYPES.some(ct => (a.sport_type ?? '').toLowerCase().includes(ct)))
  if (str && !car) return hevy.length > 0
  if (car && !str) return cardioActs.length > 0
  return hevy.length > 0 || cardioActs.length > 0
}

// ─── Coach builder ────────────────────────────────────────────────────────────

function buildCoach(rows: HealthRow[], data: any) {
  const readiness     = computePhysiologyReadiness(rows)
  const todayRow      = rows.find(r => r.datum === localDateStr())
  const sleepRows7    = rows.filter(r => r.slaap_minuten != null).slice(0, 7)
  const sleepScore    = todayRow?.slaap_minuten != null
    ? computeSleepScore(todayRow)
    : sleepRows7.length >= 2
      ? Math.round(sleepRows7.reduce((s, r) => s + (computeSleepScore(r) ?? 0), 0) / sleepRows7.length)
      : null
  const hrvBaseline   = computeHRVBaseline(rows)

  const settings       = data?.settings
  const foodLogToday   = data?.foodLogToday ?? []
  const calendarEvents = data?.calendarEvents ?? []
  const todayEvent     = calendarEvents.find((e: any) => isToday(e) && isSport(e)) ?? null

  const totalProtein  = foodLogToday.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(settings?.macro_protein ?? 180)
  const proteinLeft   = Math.round(Math.max(0, targetProtein - totalProtein))

  // Status + title
  let status: DayStatus = 'yellow'
  let title = 'Steady Day'
  if (readiness.score !== null) {
    if (readiness.score >= 75)      { status = 'green';  title = 'Strong Day' }
    else if (readiness.score >= 50) { status = 'yellow'; title = 'Moderate Day' }
    else                            { status = 'red';    title = 'Recovery Day' }
  }
  if (sleepScore !== null && sleepScore < 50 && status === 'green') {
    status = 'yellow'; title = 'Easy Day'
  }

  // 3 compact bullets replacing the paragraph
  const bullets: string[] = []

  // 1. Recovery level
  if (readiness.score !== null) {
    if (readiness.score >= 75)      bullets.push('Recovery is high')
    else if (readiness.score >= 50) bullets.push('Recovery is moderate')
    else                            bullets.push('Recovery is low')
  } else if (sleepScore !== null) {
    if (sleepScore >= 70)  bullets.push('Sleep was good')
    else if (sleepScore >= 50) bullets.push('Sleep was moderate')
    else                    bullets.push('Sleep was poor')
  }

  // 2. Training context
  if (todayEvent) {
    const t = todayEvent.title.toLowerCase()
    const isCardio = CARDIO_KW.some(kw => t.includes(kw))
    bullets.push(isCardio ? 'Cardio scheduled today' : `${todayEvent.title} planned today`)
  } else if (hrvBaseline.deviationPct !== null && hrvBaseline.deviationPct < -10) {
    bullets.push(`HRV ${Math.abs(hrvBaseline.deviationPct)}% below baseline`)
  }

  // 3. Protein remaining
  if (proteinLeft > 0) {
    bullets.push(`${proteinLeft}g protein remaining`)
  } else if (foodLogToday.length > 0) {
    bullets.push('Protein goal reached')
  }

  return { status, title, bullets: bullets.slice(0, 3) }
}

// ─── Recommendation builder ───────────────────────────────────────────────────

function buildRecommendation(rows: HealthRow[], data: any) {
  const readiness      = computePhysiologyReadiness(rows)
  const calendarEvents = data?.calendarEvents ?? []
  const todayEvent     = calendarEvents.find((e: any) => isToday(e) && isSport(e)) ?? null
  const foodLogToday   = data?.foodLogToday ?? []
  const settings       = data?.settings
  const totalProtein   = foodLogToday.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein  = Number(settings?.macro_protein ?? 180)
  const proteinLeft    = Math.round(Math.max(0, targetProtein - totalProtein))
  const hevy           = data?.todayHevy ?? []
  const acts           = data?.todayActivities ?? []

  let icon = '🏃'
  let title = 'Zone 2 Run'
  let duration = '45 min'
  let href: string | undefined
  const why: string[] = []

  if (readiness.score !== null && readiness.score < 50) {
    icon = '😴'; title = 'Rest Day'; duration = ''
    why.push(`Readiness at ${readiness.score}% — body needs recovery`)
    why.push('Skip training today')
  } else if (readiness.score !== null && readiness.score < 65) {
    icon = '🚶'; title = 'Light Walk or Mobility'; duration = '30 min'
    why.push(`Readiness at ${readiness.score}% — keep intensity low`)
    if (todayEvent) why.push(`${todayEvent.title} — reduce volume by ~25%`)
  } else if (todayEvent) {
    const t = todayEvent.title.toLowerCase()
    const isCardio  = CARDIO_KW.some(k => t.includes(k))
    const isGym     = STRENGTH_KW.some(k => t.includes(k)) && !isCardio
    const done      = workoutDone(todayEvent.title, hevy, acts)
    if (isCardio) {
      icon = t.includes('fietsen') || t.includes('cycling') || t.includes('ride') || t.includes('wielren') ? '🚴' : '🏃'
    } else {
      icon = '🏋️'
    }
    title    = todayEvent.title
    duration = done ? 'Completed ✓' : ''
    href     = isGym
      ? '/training/strength'
      : `/training/session?title=${encodeURIComponent(todayEvent.title)}&time=${encodeURIComponent((todayEvent as any).start_datetime ?? '')}`
    if (readiness.score !== null && readiness.score >= 75) why.push('Recovery is high — good day to push')
    else if (readiness.score !== null)                      why.push('Recovery is solid')
    why.push(`${todayEvent.title} on the schedule`)
  } else {
    icon = '🚴'; title = 'Zone 2 Ride'; duration = '60 min'
    if (readiness.score !== null && readiness.score >= 75) why.push('Recovery is high')
    why.push('No session planned — good day for cardio')
  }

  if (proteinLeft > 30) why.push(`${proteinLeft}g protein remaining`)
  else if (proteinLeft <= 0 && foodLogToday.length > 0) why.push('Protein goal already reached')

  return { icon, title, duration, href, why: why.slice(0, 3) }
}

// ─── Focus builder ────────────────────────────────────────────────────────────

function buildFocusItems(data: any) {
  const calendarEvents = data?.calendarEvents ?? []
  const foodLogToday   = data?.foodLogToday ?? []
  const settings       = data?.settings
  const hevy           = data?.todayHevy ?? []
  const acts           = data?.todayActivities ?? []
  const todayEvent     = calendarEvents.find((e: any) => isToday(e) && isSport(e)) ?? null

  const items: { label: string; done: boolean; href?: string }[] = []

  if (todayEvent) {
    const time = fmtTime(todayEvent.start_datetime)
    const done = workoutDone(todayEvent.title, hevy, acts)
    const t    = todayEvent.title.toLowerCase()
    const isGym = STRENGTH_KW.some(k => t.includes(k)) && !CARDIO_KW.some(k => t.includes(k))
    items.push({
      label: time ? `${todayEvent.title} at ${time}` : todayEvent.title,
      done,
      href: isGym
        ? '/training/strength'
        : `/training/session?title=${encodeURIComponent(todayEvent.title)}&time=${encodeURIComponent(todayEvent.start_datetime ?? '')}`,
    })
  } else if (hevy.length > 0) {
    items.push({ label: hevy[0].title, done: true, href: '/training/strength' })
  } else if (acts.length > 0) {
    items.push({ label: acts[0].name, done: true, href: '/training' })
  }

  const totalProtein  = foodLogToday.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(settings?.macro_protein ?? 180)
  const proteinLeft   = Math.max(0, targetProtein - totalProtein)
  items.push({
    label: proteinLeft > 0 ? `${Math.round(proteinLeft)}g protein left` : 'Protein goal reached',
    done:  proteinLeft <= 0,
    href:  '/food',
  })

  const steps    = data?.latestGezondheid?.stappen ?? 0
  const stepGoal = Number(settings?.step_goal ?? 10000)
  if (steps > 0) {
    const stepsLeft = Math.max(0, stepGoal - steps)
    items.push({
      label: stepsLeft > 0 ? `${stepsLeft.toLocaleString('en-US')} steps left` : 'Step goal reached',
      done:  stepsLeft <= 0,
      href:  '/health/activity',
    })
  }

  // Undone items first, completed last
  return items.sort((a, b) => Number(a.done) - Number(b.done)).slice(0, 3)
}

// ─── UI ───────────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  green:  { bg: 'rgba(45,212,191,0.08)',  border: 'rgba(45,212,191,0.2)',  dot: '#2dd4bf' },
  yellow: { bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.2)',  dot: '#fb923c' },
  red:    { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', dot: '#f87171' },
}

function RecommendationCard({ rec }: { rec: ReturnType<typeof buildRecommendation> }) {
  const inner = (
    <div className="p-5 rounded-[24px] border border-white/[0.12]" style={{ background: 'rgba(45,212,191,0.07)' }}>
      <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em] mb-4">Today's Recommendation</p>
      <div className="flex items-center gap-4 mb-4">
        <span className="text-[42px] leading-none">{rec.icon}</span>
        <div>
          <p className="text-[22px] font-bold text-white leading-tight">{rec.title}</p>
          {rec.duration && (
            <p className="text-[14px] text-white/40 mt-0.5">{rec.duration}</p>
          )}
        </div>
      </div>
      {rec.why.length > 0 && (
        <div className="pt-3 border-t border-white/[0.08]">
          <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.08em] mb-2.5">Why?</p>
          <div className="flex flex-col gap-1.5">
            {rec.why.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-teal-400/60 text-[12px] mt-[2px] shrink-0">•</span>
                <span className="text-[13px] text-white/65">{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
  return rec.href
    ? <a href={rec.href} className="block active:opacity-70 transition-opacity">{inner}</a>
    : inner
}

function CoachCard({ coach }: { coach: ReturnType<typeof buildCoach> }) {
  const cfg = STATUS_CFG[coach.status]
  return (
    <div className="px-4 py-3.5 rounded-[20px] border" style={{ background: cfg.bg, borderColor: cfg.border }}>
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.dot }} />
        <span className="text-[15px] font-bold text-white">{coach.title}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {coach.bullets.map((b, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="text-white/25 text-[11px] mt-[3px] shrink-0">•</span>
            <span className="text-[13px] text-white/60">{b}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FocusCard({ items }: { items: ReturnType<typeof buildFocusItems> }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em] mb-3">Today's Focus</p>
      <div className="flex flex-col gap-4">
        {items.map((item, i) => {
          const row = (
            <div className="flex items-center gap-3.5">
              <div className={`w-[22px] h-[22px] rounded-[6px] border-[1.5px] shrink-0 flex items-center justify-center transition-colors ${item.done ? 'border-teal-400 bg-teal-400/15' : 'border-white/25'}`}>
                {item.done && <span className="text-teal-400 text-[12px] font-bold leading-none">✓</span>}
              </div>
              <span className={`text-[17px] font-semibold leading-tight ${item.done ? 'text-white/30 line-through decoration-white/15' : 'text-white'}`}>
                {item.label}
              </span>
            </div>
          )
          return item.href && !item.done
            ? <a key={i} href={item.href} className="block active:opacity-70 transition-opacity">{row}</a>
            : <div key={i}>{row}</div>
        })}
      </div>
    </div>
  )
}

function ProgressCard({ data }: { data: any }) {
  const foodLog  = data?.foodLogToday ?? []
  const settings = data?.settings
  if (!settings) return null

  const totalProtein  = foodLog.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(settings.macro_protein ?? 180)
  const proteinLeft   = Math.round(Math.max(0, targetProtein - totalProtein))
  const proteinDone   = proteinLeft <= 0

  const steps    = data?.latestGezondheid?.stappen ?? 0
  const stepGoal = Number(settings.step_goal ?? 10000)
  const stepsLeft = Math.max(0, stepGoal - steps)
  const stepsDone = stepsLeft <= 0

  if (totalProtein === 0 && steps === 0) return null

  return (
    <div>
      <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em] mb-3">Progress</p>
      <div className="flex gap-3">
        {totalProtein >= 0 && (
          <a href="/food" className="flex-1 block active:opacity-70 transition-opacity">
            <div className="px-4 py-3.5 rounded-[18px] border border-white/[0.07]" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[11px] text-white/30 mb-1.5">Protein</p>
              <p className={`text-[24px] font-bold leading-none ${proteinDone ? 'text-teal-400' : 'text-white'}`}>
                {proteinDone ? '✓' : `${proteinLeft}g`}
              </p>
              <p className="text-[11px] text-white/30 mt-1">{proteinDone ? 'Goal reached' : 'remaining'}</p>
            </div>
          </a>
        )}
        {steps > 0 && (
          <a href="/health/activity" className="flex-1 block active:opacity-70 transition-opacity">
            <div className="px-4 py-3.5 rounded-[18px] border border-white/[0.07]" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[11px] text-white/30 mb-1.5">Steps</p>
              <p className={`text-[24px] font-bold leading-none ${stepsDone ? 'text-teal-400' : 'text-white'}`}>
                {stepsDone ? '✓' : stepsLeft.toLocaleString('en-US')}
              </p>
              <p className="text-[11px] text-white/30 mt-1">{stepsDone ? 'Goal reached' : 'remaining'}</p>
            </div>
          </a>
        )}
      </div>
    </div>
  )
}

function UpcomingCard({ events }: { events: any[] }) {
  if (!events.length) return null

  const daTom = new Date(tom0()); daTom.setDate(tom0().getDate() + 1)

  function dayLabel(e: any): string {
    const d = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date + 'T00:00:00')
    if (d >= tod0() && d < tom0()) return 'Today'
    if (d >= tom0() && d < daTom) return 'Tomorrow'
    const s = d.toLocaleDateString('en-US', { weekday: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  const groups = new Map<string, any[]>()
  for (const e of events) {
    const label = dayLabel(e)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(e)
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em] mb-3">Upcoming</p>
      <div className="flex flex-col gap-4">
        {[...groups.entries()].slice(0, 3).map(([label, evts]) => (
          <div key={label}>
            <p className="text-[12px] font-semibold text-white/25 mb-2">{label}</p>
            <div className="flex flex-col gap-1.5">
              {evts.map((e: any, i: number) => {
                const time = fmtTime(e.start_datetime)
                return (
                  <a
                    key={i}
                    href={`/training/session?title=${encodeURIComponent(e.title)}&time=${encodeURIComponent(e.start_datetime ?? '')}`}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-[12px] border border-white/[0.06] active:opacity-70 transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    {time && (
                      <span className="text-[12px] font-semibold text-white/30 shrink-0 tabular-nums">
                        {time}{fmtTime(e.end_datetime) ? ` – ${fmtTime(e.end_datetime)}` : ''}
                      </span>
                    )}
                    <span className="text-[14px] text-white/65">{e.title}</span>
                  </a>
                )
              })}
            </div>
          </div>
        ))}
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
  const { data: training } = useSWR('training', null)
  const rows = gezondheid ?? []

  // Invalidate 'today' cache when training data updates (Hevy sync, activity added, etc.)
  useEffect(() => {
    if (training) {
      mutate('today')
    }
  }, [training])

  // Prefer steps from the health-gezondheid cache (kept fresh by DataProvider auto-sync)
  // over the today-fetch result, which may have run before today's Fitbit sync completed.
  const todayStr = localDateStr()
  const todayHealthRow = rows.find(r => r.datum === todayStr)
  const effectiveData = data && todayHealthRow?.stappen != null
    ? { ...data, latestGezondheid: { ...(data.latestGezondheid ?? {}), stappen: todayHealthRow.stappen } }
    : data

  const rec   = buildRecommendation(rows, effectiveData)
  const coach = buildCoach(rows, effectiveData)
  const focus = buildFocusItems(effectiveData)

  return (
    <PremiumScreen title="Today" subtitle={formatSubtitle()}>
      <div className="flex flex-col gap-6" style={{ opacity: data ? 1 : 0, transition: 'opacity 0.15s ease' }}>
        <RecommendationCard rec={rec} />
        <CoachCard coach={coach} />
        <FocusCard items={focus} />
        <ProgressCard data={effectiveData} />
        <UpcomingCard events={effectiveData?.calendarEvents ?? []} />
      </div>
    </PremiumScreen>
  )
}
