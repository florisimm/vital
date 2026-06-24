'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { createClient } from '@/lib/supabase'
import { LandingPage } from '@/components/LandingPage'
import { SignupOnboarding, PENDING_PROFILE_KEY } from '@/components/SignupOnboarding'
import { SetupChecklist } from '@/components/SetupChecklist'
import { PremiumScreen } from '@/components/PremiumScreen'
import { computePhysiologyReadiness, type HealthRow } from '@/lib/readiness'
import { formatTime, localDateStr } from '@/lib/timeFormat'
import {
  computeTodaysFocus, computeACWRDetail, computePerformanceScore, computeRecoveryDetail,
  TodaysPlanCard, startOfWeek,
  type Activity as TrainingActivity, type HevyWorkout as TrainingHevyWorkout,
} from '@/app/training/sections'
import { computeRampRate } from '@/lib/training-load'

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
    supabase.from('food_log').select('kcal,protein,carbs,fat,food_name,logged_at,amount_g,meal_category').eq('user_id', user.id).eq('date', today),
    supabase.from('food_log').select('date,protein').eq('user_id', user.id).gte('date', sevenDaysAgoStr).order('date', { ascending: false }),
    supabase.from('user_settings').select('macro_kcal,macro_protein,macro_carbs,macro_fat,step_goal,training_intensity').eq('user_id', user.id).maybeSingle(),
    supabase.from('calendar_events').select('id,title,start_date,start_datetime,end_datetime').eq('user_id', user.id).gte('start_date', today).order('start_date', { ascending: true }),
    supabase.from('hevy_workouts').select('id,title,start_time').eq('user_id', user.id).gte('start_time', todayIso),
    supabase.from('strava_activities').select('id,name,sport_type,start_date').eq('user_id', user.id).gte('start_date', today),
    supabase.from('hevy_workouts').select('id,title,start_time,sport_type').eq('user_id', user.id).gte('start_time', weekStartStr),
    supabase.from('strava_activities').select('id,name,sport_type,start_date').eq('user_id', user.id).gte('start_date', weekStartStr),
  ])

  // Secondary lookup: caffeine_mg per product name for today's logged items
  const foodNames = (foodLogToday ?? []).map((f: any) => f.food_name).filter(Boolean)
  let caffeineByName: Record<string, number> = {}
  if (foodNames.length > 0) {
    const { data: prods } = await supabase
      .from('products')
      .select('name,caffeine')
      .in('name', foodNames)
      .not('caffeine', 'is', null)
    for (const p of prods ?? []) {
      if (p.caffeine) caffeineByName[(p.name ?? '').toLowerCase()] = Number(p.caffeine)
    }
  }

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
    caffeineByName,
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
  weatherData,
}: { rows: HealthRow[]; effectiveData: any; unifiedReadinessPct: number; weatherData?: { temp_c: number | null; night_temp_c: number | null } | null }): FocusTip[] {
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
  if (earlyTomorrow) bedtimeSub = earlyTomorrow.title ? `Early: ${earlyTomorrow.title}` : 'Early session tomorrow'

  // bedtime = 07:00 − needed sleep (normalize to 0–1440 to handle pre-midnight)
  const rawBedtime = WAKE_MINS - neededMin
  const bedtimeMins = ((rawBedtime % 1440) + 1440) % 1440
  const bh = Math.floor(bedtimeMins / 60)
  const bm = bedtimeMins % 60
  const neededHours = neededMin / 60
  const neededLabel = Number.isInteger(neededHours) ? `${neededHours}h` : `${neededHours.toFixed(1).replace('.0', '')}h`
  tips.push({ emoji: '🌙', label: `Go to sleep by ${bh}:${bm.toString().padStart(2, '0')}`, sub: `${neededLabel} — ${bedtimeSub}` })

  // ── Caffeine cutoff ──
  const CAFFEINE_KW: [string, number][] = [
    ['espresso', 60], ['ristretto', 60], ['cappuccino', 60], ['latte', 60],
    ['flat white', 60], ['macchiato', 60], ['americano', 80], ['lungo', 80],
    ['red bull', 80], ['energy drink', 80], ['monster', 160],
    ['pre-workout', 150], ['pre workout', 150],
    ['koffie', 80], ['coffee', 80],
  ]
  const MEAL_CAT_HOUR: Record<string, number> = {
    ontbijt: 8, snack_ochtend: 10.5, lunch: 12.5,
    snack_middag: 15, avondeten: 18, snack_avond: 20, supps: 8,
  }
  const nowH = new Date().getHours() + new Date().getMinutes() / 60
  const bedtimeH = bedtimeMins / 60

  const caffeineByName: Record<string, number> = effectiveData?.caffeineByName ?? {}

  let coffeeCount = 0
  let remainingMg = 0
  for (const item of (effectiveData?.foodLogToday ?? [])) {
    const name = (item.food_name ?? '').toLowerCase()
    const amountG = Number(item.amount_g ?? 100)
    // Product DB: caffeine is per 100g — scale by actual amount
    let cafMg = caffeineByName[name] != null
      ? caffeineByName[name] * amountG / 100
      : 0
    // Keyword fallback: fixed mg per serving (already total, not per 100g)
    if (cafMg === 0) {
      for (const [kw, mg] of CAFFEINE_KW) { if (name.includes(kw)) { cafMg = mg; break } }
    }
    if (cafMg === 0) continue
    coffeeCount++
    const loggedH = item.logged_at
      ? new Date(item.logged_at).getHours() + new Date(item.logged_at).getMinutes() / 60
      : (MEAL_CAT_HOUR[item.meal_category] ?? nowH)
    remainingMg += cafMg * Math.pow(0.5, (bedtimeH - loggedH) / 5.5)
  }

  const CUP_MG = 80
  const THRESHOLD_MG = 50
  const headroom = Math.max(0, THRESHOLD_MG - remainingMg)
  const cutoffH = headroom > 0
    ? bedtimeH - 5.5 * Math.log2(CUP_MG / headroom)
    : bedtimeH - 10
  const cutoffTotalMin = Math.round(((cutoffH * 60) % 1440 + 1440) % 1440)
  const cutoffStr = `${Math.floor(cutoffTotalMin / 60)}:${(cutoffTotalMin % 60).toString().padStart(2, '0')}`
  const hoursUntilCutoff = cutoffH - nowH

  if (coffeeCount > 0) {
    if (hoursUntilCutoff <= 0) {
      tips.push({ emoji: '☕', label: 'No more coffee today', sub: `${Math.round(remainingMg)}mg caffeine still active at bedtime` })
    } else if (hoursUntilCutoff < 1.5) {
      tips.push({ emoji: '☕', label: `Last coffee by ${cutoffStr}`, sub: `${coffeeCount} cup${coffeeCount > 1 ? 's' : ''} today — cutoff approaching` })
    } else {
      tips.push({ emoji: '☕', label: `Coffee okay until ${cutoffStr}`, sub: `${coffeeCount} cup${coffeeCount > 1 ? 's' : ''} today — ${Math.round(remainingMg)}mg active at sleep` })
    }
  } else if (hoursUntilCutoff <= 0 && nowH < bedtimeH) {
    tips.push({ emoji: '☕', label: 'Skip caffeine now', sub: `Only ${Math.round((bedtimeH - nowH) * 60)}min until bedtime` })
  } else if (hoursUntilCutoff < 1.5 && hoursUntilCutoff > 0) {
    tips.push({ emoji: '☕', label: `Coffee cutoff at ${cutoffStr}`, sub: 'After that, sleep quality drops' })
  }

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
  const tempC = weatherData?.temp_c
  if (tempC != null && tempC >= 28) {
    tips.push({ emoji: '🌡️', label: `Train early — it's ${Math.round(tempC)}°C today`, sub: 'Heat raises HR and reduces performance. Morning or indoor training recommended.' })
    if (tips.length < 4) tips.push({ emoji: '💧', label: 'Drink 3L+ today', sub: `${Math.round(tempC)}°C increases fluid loss significantly` })
  } else if (hasTrainingToday && tips.length < 3) {
    tips.push({ emoji: '💧', label: 'Drink at least 2.5L today', sub: 'Performance drops at 2% dehydration' })
  }

  return tips.slice(0, 5)
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

function UpcomingCard({ events, onSync, hevy, acts }: { events: any[]; onSync: () => Promise<void>; hevy: any[]; acts: any[] }) {
  const [syncing, setSyncing] = useState(false)
  const [showAll, setShowAll] = useState(false)

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

  const allEvts = [...groups.entries()]
    .flatMap(([, { label, evts }]) => evts.map(e => ({ ...e, _label: label })))
    .filter(e => isToday(e) ? !workoutDone(e.title, hevy, acts) : true)
  const next = allEvts[0] ?? null
  const moreCount = allEvts.length - 1
  const dayGroups = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => g)

  return (
    <div>
      {showAll && (
        <div className="fixed inset-0 z-[60] flex flex-col"
          style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between px-5 py-4 shrink-0">
            <button onClick={() => setShowAll(false)}
              className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.10)' }}>
              Back
            </button>
            <span className="text-[17px] font-semibold text-white">Schedule</span>
            <div className="w-[70px]" />
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-12" style={{ scrollbarWidth: 'none' }}>
            {dayGroups.length === 0 ? (
              <p className="text-[15px] text-white/30 text-center pt-12">No upcoming sessions.</p>
            ) : (
              <div className="flex flex-col gap-6">
                {dayGroups.map((g, gi) => (
                  <div key={gi} className="flex flex-col gap-2">
                    <p className="text-[12px] font-semibold text-white/40 uppercase tracking-[0.08em] px-1">{g.label}</p>
                    {g.evts.map((e, ei) => (
                      <a key={ei}
                        href={`/training/session?title=${encodeURIComponent(e.title)}&time=${encodeURIComponent(e.start_datetime ?? '')}`}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-[16px] border border-white/[0.07] active:opacity-70 transition-opacity"
                        style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-[15px] font-semibold text-white truncate">{e.title}</span>
                          {fmtTime(e.start_datetime) && (
                            <span className="text-[12px] text-white/35 mt-0.5">{fmtTime(e.start_datetime)}</span>
                          )}
                        </div>
                        <span className="text-white/30 text-[18px] shrink-0">›</span>
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
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
          <button onClick={() => setShowAll(true)} className="text-center text-[12px] font-semibold text-teal-400/70 py-2 active:opacity-60 transition-opacity">
            View full schedule ({moreCount} more)
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Auth gate: logged-out visitors see the marketing landing page, logged-in
// users see their Today dashboard. Keeps the dashboard at `/` so the bottom
// nav Today tab is unchanged.
export default function HomePage() {
  const [authState, setAuthState] = useState<'loading' | 'in' | 'out'>('loading')
  // null = not yet checked, true/false = onboarding completion known
  const [onboarded, setOnboarded] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) setAuthState(user ? 'in' : 'out')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setAuthState(session?.user ? 'in' : 'out')
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  // Once logged in, check whether onboarding is done. If the user filled in the
  // signup wizard but had to confirm their email first, replay that stashed
  // profile here so nothing entered is lost.
  useEffect(() => {
    if (authState !== 'in') return
    let active = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('user_settings').select('onboarded, user_id').eq('user_id', user.id).maybeSingle()
      if (!active) return

      // Any existing settings row means the user has used the app before — skip wizard.
      // Also backfill onboarded=true so future checks skip the DB comparison entirely.
      if (data) {
        if (!data.onboarded) {
          supabase.from('user_settings').update({ onboarded: true }).eq('user_id', user.id).then(() => {})
        }
        setOnboarded(true)
        return
      }

      // Replay a profile collected during signup (email-confirmation flow)
      let pending: Record<string, unknown> | null = null
      try {
        const raw = localStorage.getItem(PENDING_PROFILE_KEY)
        if (raw) pending = JSON.parse(raw)
      } catch { /* ignore */ }

      if (pending) {
        await supabase.from('user_settings').upsert({ user_id: user.id, ...pending }, { onConflict: 'user_id' })
        try { localStorage.removeItem(PENDING_PROFILE_KEY) } catch { /* ignore */ }
        if (active) setOnboarded(true)
        return
      }

      if (active) setOnboarded(false)
    })()
    return () => { active = false }
  }, [authState])

  if (authState === 'loading') return null
  if (authState === 'out') return <LandingPage />
  if (onboarded === null) return null
  if (!onboarded) return <SignupOnboarding mode="onboarding" onClose={() => setOnboarded(true)} onComplete={() => setOnboarded(true)} />
  return <TodayDashboard />
}

function TodayDashboard() {
  const { data } = useSWR('today', fetchTodayData, {
    revalidateOnFocus: true,
    revalidateOnMount: true,
    dedupingInterval: 5_000,
  })

  const { data: gezondheid } = useSWR<HealthRow[]>('health-gezondheid', null)
  const { data: training } = useSWR('training', null)
  const { data: weatherData } = useSWR<{ temp_c: number | null; night_temp_c: number | null; city: string | null }>(
    'weather', () => fetch('/api/weather').then(r => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3600000 },
  )
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

  const hevySyncedRef = useRef(false)
  useEffect(() => {
    // Sync Hevy on every visit until today's weight is in — then stop for the day.
    if (hevySyncedRef.current) return
    if (!gezondheid) return // wait until health data is loaded
    const todayRow = gezondheid.find(r => r.datum === localDateStr())
    if (todayRow?.gewicht != null) return // weight already fetched today → skip
    hevySyncedRef.current = true
    async function syncHevy() {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/hevy-sync`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        })
        mutate('training')
        mutate('health-gezondheid')
      } catch { /* ignore */ }
    }
    syncHevy()
  }, [gezondheid])

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
    const injuries: Record<string, boolean> = (training as any)?.injuries ?? {}
    const selfPlanned: Record<string, boolean> = (training as any)?.selfPlanned ?? {}

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
    const rampRate    = computeRampRate(activities, hevy)
    const acwrDetail  = computeACWRDetail(activities, hevy, now, rampRate)

    const weekActivities = activities.filter(a => a.start_date >= weekStart)
    const weekHevy       = hevy.filter(h => h.start_time >= weekStart)
    const weekRunning  = weekActivities.filter(a => (a.sport_type ?? '').toLowerCase().includes('run')).length
    const weekCycling  = weekActivities.filter(a => { const t = (a.sport_type ?? '').toLowerCase(); return t.includes('ride') || t.includes('cycl') }).length
    const weekSwimming = weekActivities.filter(a => (a.sport_type ?? '').toLowerCase().includes('swim')).length
    const cardioTargets = [
      { sport: 'running'  as const, label: 'Running',  emoji: '🏃', target: (injuries.running  || selfPlanned.running)  ? 0 : (trainingFrequencies.running  ?? 0), done: weekRunning },
      { sport: 'cycling'  as const, label: 'Cycling',  emoji: '🚴', target: (injuries.cycling  || selfPlanned.cycling)  ? 0 : (trainingFrequencies.cycling  ?? 0), done: weekCycling },
      { sport: 'swimming' as const, label: 'Swimming', emoji: '🏊', target: (injuries.swimming || selfPlanned.swimming) ? 0 : (trainingFrequencies.swimming ?? 0), done: weekSwimming },
    ]
    const gymTarget = (injuries.gym || selfPlanned.gym) ? 0 : (trainingFrequencies.gym ?? 0)

    const trainingIntensity = (effectiveData?.settings as any)?.training_intensity ?? 'moderate'
    const focus = computeTodaysFocus(activities, hevy, calendarEvents, unifiedReadinessPct, perf, acwrDetail, rampRate, cardioTargets, gymTarget, sportPriority, goalPriority, trainingIntensity)
    const biasApplied = biasPoints !== 0
    return { todaysFocus: focus, unifiedReadinessPct, biasApplied }
  }, [training, rows, effectiveData]) // eslint-disable-line react-hooks/exhaustive-deps

  const lifestyleFocus = useMemo(
    () => buildLifestyleFocus({ rows, effectiveData, unifiedReadinessPct, weatherData }),
    [rows, effectiveData, unifiedReadinessPct, weatherData], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const hasNoData = !!data && !!training &&
    (training?.activities ?? []).length === 0 &&
    (training?.hevy ?? []).length === 0 &&
    rows.length === 0

  return (
    <PremiumScreen title="Today" subtitle={formatSubtitle()}>
      <div className="mb-6"><SetupChecklist /></div>
      <div className="flex flex-col gap-6" style={{ opacity: data ? 1 : 0, transition: 'opacity 0.15s ease' }}>
        {hasNoData && (
          <div className="rounded-[20px] px-5 py-5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-[16px] font-semibold text-white mb-1">No data yet</p>
            <p className="text-[14px] text-white/45 leading-relaxed">Connect Strava, Hevy or a wearable from your Profile to start seeing your readiness and recommendations.</p>
          </div>
        )}
        {!hasNoData && <TodaysPlanCard
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
        />}
        {!hasNoData && <LifestyleFocusCard tips={lifestyleFocus} />}
        <ProgressCard data={effectiveData} />
        <UpcomingCard
          events={(effectiveData?.calendarEvents ?? []).filter(isSport)}
          hevy={effectiveData?.todayHevy ?? []}
          acts={effectiveData?.todayActivities ?? []}
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
