'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { createClient } from '@/lib/supabase'
import { PremiumScreen } from '@/components/PremiumScreen'
import { computePhysiologyReadiness, type HealthRow } from '@/lib/readiness'
import { formatTime, localDateStr } from '@/lib/timeFormat'
import {
  computeTodaysFocus, computeACWRDetail, computePerformanceScore, computeRecoveryDetail,
  TodaysPlanCard, startOfWeek,
  type Activity as TrainingActivity, type HevyWorkout as TrainingHevyWorkout,
} from '@/app/training/sections'
import { effectiveLoad, hevyLoad, isAccessorySession } from '@/lib/training-load'

// ─── Constants ────────────────────────────────────────────────────────────────

const STRENGTH_KW = ['pull', 'push', 'legs', 'chest', 'back', 'squat', 'gym', 'strength', 'deadlift', 'bench', 'bicep', 'tricep', 'shoulder', 'upper', 'lower', 'weights', 'strength']
const CARDIO_KW   = ['run', 'long run', 'bike', 'swim', 'swim', 'ride', 'cycling', 'run', 'cycle', 'long run', 'interval', 'tempo', 'zone']
const CARDIO_SPORT_TYPES = ['run', 'ride', 'swim', 'walk', 'hike', 'virtual_run', 'virtual_ride', 'rowing', 'kayaking', 'crossfit', 'elliptical']
const SPORT_KW = [...new Set([...STRENGTH_KW, ...CARDIO_KW, 'football', 'tennis', 'volleyball', 'training', 'workout', 'tournament', 'sport', 'sports', 'crossfit', 'yoga', 'padel', 'hockey', 'basketball', 'cycling'])]

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
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const weekStartStr = localDateStr(weekStart)

  const [
    { data: latestGezondheid },
    { data: foodLogToday },
    { data: foodLog7d },
    { data: settings },
    { data: calendarEvents },
    { data: todayHevy },
    { data: todayActivities },
    { data: weekHevy },
    { data: weekActivities },
  ] = await Promise.all([
    supabase.from('gezondheid').select('stappen,gewicht,datum').eq('user_id', user.id).eq('datum', today).maybeSingle(),
    supabase.from('food_log').select('kcal,protein,carbs,fat').eq('user_id', user.id).eq('date', today),
    supabase.from('food_log').select('date,protein').eq('user_id', user.id).gte('date', sevenDaysAgoStr).order('date', { ascending: false }),
    supabase.from('user_settings').select('macro_kcal,macro_protein,macro_carbs,macro_fat,step_goal,training_intensity').eq('user_id', user.id).maybeSingle(),
    supabase.from('calendar_events').select('id,title,start_date,start_datetime,end_datetime').eq('user_id', user.id).gte('start_date', today).order('start_date', { ascending: true }),
    supabase.from('hevy_workouts').select('id,title,start_time').eq('user_id', user.id).gte('start_time', todayIso),
    supabase.from('strava_activities').select('id,name,sport_type,start_date').eq('user_id', user.id).gte('start_date', today),
    supabase.from('hevy_workouts').select('id,title,start_time,sport_type').eq('user_id', user.id).gte('start_time', weekStartStr),
    supabase.from('strava_activities').select('id,name,sport_type,start_date').eq('user_id', user.id).gte('start_date', weekStartStr),
  ])

  return {
    latestGezondheid,
    foodLogToday:   foodLogToday   ?? [],
    foodLog7d:      foodLog7d      ?? [],
    settings,
    calendarEvents: calendarEvents ?? [],
    todayHevy:      todayHevy      ?? [],
    todayActivities: todayActivities ?? [],
    allHevy:        weekHevy       ?? [],
    allActivities:  weekActivities ?? [],
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

// ─── Lifestyle Focus card ─────────────────────────────────────────────────────

type FocusTip = { emoji: string; label: string; sub?: string }

function buildLifestyleFocus({
  rows,
  effectiveData,
  unifiedReadinessPct,
}: { rows: HealthRow[]; effectiveData: any; unifiedReadinessPct: number }): FocusTip[] {
  const tips: FocusTip[] = []

  // ── Bedtime = 07:00 − needed sleep ──
  const WAKE_MINS = 7 * 60 // assume 07:00 wake-up

  const recentSleep = rows.filter(r => r.slaap_minuten != null).slice(0, 7)
  const avgSleepMin = recentSleep.length
    ? recentSleep.reduce((s, r) => s + (r.slaap_minuten ?? 0), 0) / recentSleep.length
    : null

  let neededMin = 8 * 60 // base: 8h
  let bedtimeSub = '8h sleep target'

  if (avgSleepMin != null && avgSleepMin < 7 * 60) {
    neededMin = Math.max(neededMin, 8.5 * 60)
    bedtimeSub = "Sleep debt — you need extra rest"
  }

  // HRV below baseline → more recovery
  const latestHRV = rows[0]?.hrv_rmssd
  const recentHRVs = rows.filter(r => r.hrv_rmssd != null).slice(0, 7)
  let hrvBelowBaseline = false
  if (latestHRV != null && recentHRVs.length >= 3) {
    const baseline = recentHRVs.reduce((s, r) => s + (r.hrv_rmssd ?? 0), 0) / recentHRVs.length
    if (latestHRV < baseline * 0.85) {
      hrvBelowBaseline = true
      neededMin = Math.max(neededMin, 8.5 * 60)
      bedtimeSub = 'HRV is low — extra sleep helps recovery'
    }
  }

  if (unifiedReadinessPct < 60) {
    neededMin = Math.max(neededMin, 8.5 * 60)
    bedtimeSub = 'Recovery mode — aim for extra sleep'
  }

  // Early event tomorrow → keep base need but flag it
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomStr = tomorrow.toISOString().split('T')[0]
  const earlyTomorrow = (effectiveData?.calendarEvents ?? []).find((e: any) => {
    if (e.start_date !== tomStr || !e.start_datetime) return false
    return new Date(e.start_datetime).getHours() < 9
  })
  if (earlyTomorrow) bedtimeSub = 'Early session tomorrow'

  // bedtime = 07:00 − needed sleep (normalize to 0–1440 to handle pre-midnight)
  const rawBedtime = WAKE_MINS - neededMin
  const bedtimeMins = ((rawBedtime % 1440) + 1440) % 1440
  const bh = Math.floor(bedtimeMins / 60)
  const bm = bedtimeMins % 60
  const neededHours = neededMin / 60
  const neededLabel = Number.isInteger(neededHours) ? `${neededHours}h` : `${neededHours.toFixed(1).replace('.0', '')}h`
  tips.push({ emoji: '🌙', label: `Go to sleep by ${bh}:${bm.toString().padStart(2, '0')}`, sub: `${neededLabel} — ${bedtimeSub}` })

  // ── HRV warning ──
  if (hrvBelowBaseline) {
    tips.push({ emoji: '🚫', label: 'Skip alcohol tonight', sub: 'HRV is below your baseline' })
  }

  // ── Readiness advice ──
  if (unifiedReadinessPct < 55) {
    tips.push({ emoji: '🛋️', label: 'Rest or easy walk only', sub: 'Recovery is the training today' })
  } else if (unifiedReadinessPct >= 85) {
    tips.push({ emoji: '⚡', label: 'Your body is ready — go for it', sub: 'Readiness is high' })
  }

  // ── Pre-workout nutrition ──
  const todayCalEvent = (effectiveData?.calendarEvents ?? []).find((e: any) => isToday(e) && isSport(e))
  if (todayCalEvent?.start_datetime) {
    const hoursUntil = (new Date(todayCalEvent.start_datetime).getTime() - Date.now()) / 3_600_000
    if (hoursUntil > 0.5 && hoursUntil <= 2.5) {
      const t = fmtTime(todayCalEvent.start_datetime)
      tips.push({ emoji: '🍌', label: `Eat before your ${t} session`, sub: 'Light carbs 60–90 min before' })
    }
  }

  // ── Hydration nudge on training days ──
  const hasTrainingToday = (effectiveData?.calendarEvents ?? []).some((e: any) => isToday(e) && isSport(e))
  if (hasTrainingToday && tips.length < 3) {
    tips.push({ emoji: '💧', label: 'Drink at least 2.5L today', sub: 'Performance drops at 2% dehydration' })
  }

  return tips.slice(0, 4)
}

function LifestyleFocusCard({ tips }: { tips: FocusTip[] }) {
  if (tips.length === 0) return null
  return (
    <div>
      <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em] mb-3">Focus</p>
      <div className="rounded-[20px] border border-white/[0.07] overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {tips.map((tip, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-4 py-4 ${i < tips.length - 1 ? 'border-b border-white/[0.05]' : ''}`}
          >
            <span className="text-[24px] leading-none shrink-0">{tip.emoji}</span>
            <div className="flex flex-col min-w-0">
              <span className="text-[15px] font-semibold text-white leading-snug">{tip.label}</span>
              {tip.sub && <span className="text-[12px] text-white/35 mt-0.5">{tip.sub}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
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
      label: stepsLeft > 0 ? `${steps.toLocaleString('en-US')} / ${stepGoal.toLocaleString('en-US')} steps` : 'Step goal reached',
      done:  stepsLeft <= 0,
      href:  '/health/activity',
    })
  }

  // Undone items first, completed last
  return items.sort((a, b) => Number(a.done) - Number(b.done)).slice(0, 3)
}

// ─── UI ───────────────────────────────────────────────────────────────────────

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

  const totalProtein  = Math.round(foodLog.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0))
  const targetProtein = Number(settings.macro_protein ?? 180)
  const proteinDone   = totalProtein >= targetProtein
  const proteinPct    = Math.min(1, totalProtein / targetProtein)

  const steps    = data?.latestGezondheid?.stappen ?? 0
  const stepGoal = Number(settings.step_goal ?? 10000)
  const stepsDone = steps >= stepGoal
  const stepsPct  = Math.min(1, steps / stepGoal)

  // SVG ring for steps
  const R = 20, C = 2 * Math.PI * R
  const dash = stepsPct * C

  if (totalProtein === 0 && steps === 0) return null

  return (
    <div>
      <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em] mb-3">Progress</p>
      <div className="flex gap-3">
        {settings.macro_protein > 0 && (
          <a href="/food" className="flex-1 block active:opacity-70 transition-opacity">
            <div className="px-4 py-3.5 rounded-[18px] border border-white/[0.07]" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[11px] text-white/30 mb-2">Protein</p>
              <p className={`text-[22px] font-bold leading-none ${proteinDone ? 'text-teal-400' : 'text-white'}`}>
                {proteinDone ? '✓' : `${totalProtein}g`}
              </p>
              <p className="text-[11px] text-white/30 mt-0.5 mb-2">
                {proteinDone ? 'Goal reached' : `/ ${targetProtein}g`}
              </p>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${proteinPct * 100}%`, background: proteinDone ? 'rgb(45,212,191)' : 'rgb(251,146,60)' }} />
              </div>
            </div>
          </a>
        )}
        {steps > 0 && (
          <a href="/health/activity" className="flex-1 block active:opacity-70 transition-opacity">
            <div className="px-4 py-3.5 rounded-[18px] border border-white/[0.07]" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[11px] text-white/30 mb-2">Steps</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-[22px] font-bold leading-none ${stepsDone ? 'text-teal-400' : 'text-white'}`}>
                    {stepsDone ? '✓' : steps.toLocaleString('en-US')}
                  </p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    {stepsDone ? 'Goal reached' : `${Math.round(stepsPct * 100)}%`}
                  </p>
                </div>
                <svg width="44" height="44" viewBox="0 0 48 48" className="shrink-0 -rotate-90">
                  <circle cx="24" cy="24" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                  <circle cx="24" cy="24" r={R} fill="none"
                    stroke={stepsDone ? 'rgb(45,212,191)' : 'rgb(251,146,60)'}
                    strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${dash} ${C}`} />
                </svg>
              </div>
            </div>
          </a>
        )}
      </div>
    </div>
  )
}

function UpcomingCard({ events, onSync }: { events: any[]; onSync: () => Promise<void> }) {
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    setSyncing(true)
    try { await onSync() } finally { setSyncing(false) }
  }

  const daTom = new Date(tom0()); daTom.setDate(tom0().getDate() + 1)
  const weekEnd = new Date(tod0()); weekEnd.setDate(tod0().getDate() + 7)

  function dayLabel(d: Date): string {
    if (d >= tod0() && d < tom0()) return 'Today'
    if (d >= tom0() && d < daTom) return 'Tomorrow'
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
    // Beyond this week, qualify with the date so different weeks don't merge
    if (d >= weekEnd) return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    return weekday.charAt(0).toUpperCase() + weekday.slice(1)
  }

  // Group by the actual calendar date (not weekday name) so events from
  // different weeks never collapse into one group.
  const groups = new Map<string, { label: string; evts: any[] }>()
  for (const e of events) {
    const d = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date + 'T00:00:00')
    const key = e.start_date
    if (!groups.has(key)) groups.set(key, { label: dayLabel(d), evts: [] })
    groups.get(key)!.evts.push(e)
  }

  const allEvts = [...groups.entries()].flatMap(([, { label, evts }]) => evts.map(e => ({ ...e, _label: label })))
  const next = allEvts[0] ?? null
  const moreCount = allEvts.length - 1

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em]">Upcoming</p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-white/30 active:text-white/60 transition-colors disabled:opacity-40"
          aria-label="Sync calendar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: syncing ? 'spin 1s linear infinite' : undefined }}>
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {next ? (
          <a
            href={`/training/session?title=${encodeURIComponent(next.title)}&time=${encodeURIComponent(next.start_datetime ?? '')}`}
            className="flex items-center gap-3 px-4 py-3 rounded-[14px] border border-white/[0.06] active:opacity-70 transition-opacity"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[14px] font-semibold text-white truncate">{next.title}</span>
              <span className="text-[12px] text-white/35 mt-0.5">
                {next._label}{fmtTime(next.start_datetime) ? ` · ${fmtTime(next.start_datetime)}` : ''}
              </span>
            </div>
            <span className="text-white/30 text-[18px] shrink-0">›</span>
          </a>
        ) : (
          <p className="text-[13px] text-white/30">No upcoming sessions.</p>
        )}
        {moreCount > 0 && (
          <a href="/training" className="text-center text-[12px] font-semibold text-teal-400/70 py-2 active:opacity-60 transition-opacity">
            View full schedule ({moreCount} more)
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const { data } = useSWR('today', fetchTodayData, {
    revalidateOnFocus: true,
    revalidateOnMount: true,
    dedupingInterval: 5_000,
  })

  const { data: gezondheid } = useSWR<HealthRow[]>('health-gezondheid', null)
  const { data: training } = useSWR('training', null)
  const rows = gezondheid ?? []

  useEffect(() => {
    if (training) mutate('today')
  }, [training])

  useEffect(() => {
    async function syncCalendar() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/google-calendar-sync`, { method: 'POST', headers })
        mutate('today')
      } catch { /* ignore */ }
    }
    syncCalendar()
  }, [])

  const todayStr = localDateStr()
  const todayHealthRow = rows.find(r => r.datum === todayStr)
  const effectiveData = data && todayHealthRow?.stappen != null
    ? { ...data, latestGezondheid: { ...(data.latestGezondheid ?? {}), stappen: todayHealthRow.stappen } }
    : data

  const focus = buildFocusItems(effectiveData)

  // Compute training recommendation using the same logic as the Training overview

  const { todaysFocus, unifiedReadinessPct, biasApplied } = useMemo(() => {
    const activities: TrainingActivity[] = training?.activities ?? []
    const hevy: TrainingHevyWorkout[]    = training?.hevy ?? []
    const calendarEvents                 = effectiveData?.calendarEvents ?? []
    const biasBySport: Record<string, number> = training?.biasBySport ?? {}
    const trainingFrequencies: Record<string, number> = training?.trainingFrequencies ?? {}
    const sportPriority: string[] = training?.sportPriority ?? (effectiveData?.settings as any)?.training_sport_priority ?? []
    const goalPriority: string[] = (training as any)?.goalPriority ?? []

    const physiologyReadiness = computePhysiologyReadiness(rows)
    const recoveryDetail      = computeRecoveryDetail(activities, hevy)
    const perf                = computePerformanceScore(activities, hevy)

    const rawReadinessPct = physiologyReadiness.score !== null
      ? Math.round(physiologyReadiness.score * 0.70 + recoveryDetail.pct * 0.30)
      : recoveryDetail.pct
    const biasValues  = Object.values(biasBySport)
    const avgBias     = biasValues.length > 0 ? biasValues.reduce((s, v) => s + v, 0) / biasValues.length : 0
    const biasPoints  = Math.round(avgBias * 100)
    const INTENSITY_BIAS: Record<string, number> = { easy: -15, moderate: 0, hard: 15, all_out: 25 }
    const intensityBias = INTENSITY_BIAS[effectiveData?.settings?.training_intensity ?? 'moderate'] ?? 0
    const unifiedReadinessPct = Math.min(100, Math.max(0, rawReadinessPct + biasPoints + intensityBias))

    const now         = Date.now()
    const weekStart   = startOfWeek()
    const sevenDaysAgo    = new Date(now - 7  * 86400000).toISOString()
    const fourteenDaysAgo = new Date(now - 14 * 86400000).toISOString()
    const acute7kj = activities.filter(a => a.start_date >= sevenDaysAgo).reduce((s, a) => s + effectiveLoad(a), 0)
      + hevy.filter(h => h.start_time >= sevenDaysAgo && !isAccessorySession(h)).reduce((s, h) => s + hevyLoad(h), 0)
    const prev7kj  = activities.filter(a => a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo).reduce((s, a) => s + effectiveLoad(a), 0)
      + hevy.filter(h => h.start_time >= fourteenDaysAgo && h.start_time < sevenDaysAgo && !isAccessorySession(h)).reduce((s, h) => s + hevyLoad(h), 0)
    const rampRate = prev7kj > 5
      ? Math.max(-100, Math.min(200, Math.round((acute7kj - prev7kj) / prev7kj * 100)))
      : null
    const acwrDetail = computeACWRDetail(activities, hevy, now, rampRate)

    const weekActivities = activities.filter(a => a.start_date >= weekStart)
    const weekHevy       = hevy.filter(h => h.start_time >= weekStart)
    const weekRunning  = weekActivities.filter(a => (a.sport_type ?? '').toLowerCase().includes('run')).length
    const weekCycling  = weekActivities.filter(a => { const t = (a.sport_type ?? '').toLowerCase(); return t.includes('ride') || t.includes('cycl') }).length
    const weekSwimming = weekActivities.filter(a => (a.sport_type ?? '').toLowerCase().includes('swim')).length
    const cardioTargets = [
      { sport: 'running'  as const, label: 'Running',  emoji: '🏃', target: trainingFrequencies.running  ?? 0, done: weekRunning },
      { sport: 'cycling'  as const, label: 'Cycling',  emoji: '🚴', target: trainingFrequencies.cycling  ?? 0, done: weekCycling },
      { sport: 'swimming' as const, label: 'Swimming', emoji: '🏊', target: trainingFrequencies.swimming ?? 0, done: weekSwimming },
    ]

    const trainingIntensity = (effectiveData?.settings as any)?.training_intensity ?? 'moderate'
    const focus = computeTodaysFocus(activities, hevy, calendarEvents, unifiedReadinessPct, perf, acwrDetail, rampRate, cardioTargets, trainingFrequencies.gym ?? 0, sportPriority, goalPriority, trainingIntensity)
    const biasApplied = biasPoints !== 0
    return { todaysFocus: focus, unifiedReadinessPct, biasApplied }
  }, [training, rows, effectiveData]) // eslint-disable-line react-hooks/exhaustive-deps

  const lifestyleFocus = useMemo(
    () => buildLifestyleFocus({ rows, effectiveData, unifiedReadinessPct }),
    [rows, effectiveData, unifiedReadinessPct], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <PremiumScreen title="Today" subtitle={formatSubtitle()}>
      <div className="flex flex-col gap-6" style={{ opacity: data ? 1 : 0, transition: 'opacity 0.15s ease' }}>
        <TodaysPlanCard
          simplified
          focus={todaysFocus}
          calendarEvents={effectiveData?.calendarEvents ?? []}
          readinessPct={unifiedReadinessPct}
          biasApplied={biasApplied}
          label="Today's Recommendation"
          completedToday={(() => {
            const hevy = (effectiveData?.todayHevy ?? []).map((h: any) => ({ name: h.title, sport: 'strength' }))
            const hevyNames = new Set(hevy.map((h: any) => h.name.toLowerCase()))
            const cardio = (effectiveData?.todayActivities ?? [])
              .filter((a: any) => !STRENGTH_KW.some(k => (a.sport_type ?? '').toLowerCase().includes(k)))
              .filter((a: any) => !hevyNames.has(a.name.toLowerCase()))
              .map((a: any) => ({ name: a.name, sport: a.sport_type }))
            return [...hevy, ...cardio]
          })()}
        />
        <LifestyleFocusCard tips={lifestyleFocus} />
        <ProgressCard data={effectiveData} />
        <UpcomingCard
          events={(effectiveData?.calendarEvents ?? []).filter(isSport)}
          onSync={async () => {
            try {
              const supabase = createClient()
              const { data: { session } } = await supabase.auth.getSession()
              if (!session?.access_token) return
              const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }
              await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/google-calendar-sync`, { method: 'POST', headers })
              mutate('today')
            } catch { /* ignore */ }
          }}
        />
      </div>
    </PremiumScreen>
  )
}
