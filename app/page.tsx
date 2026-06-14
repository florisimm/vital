'use client'

import useSWR from 'swr'
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
  const readiness   = computePhysiologyReadiness(rows)
  const todayRow    = rows.find(r => r.datum === localDateStr())
  const sleepRows7  = rows.filter(r => r.slaap_minuten != null).slice(0, 7)
  const sleepScore  = todayRow?.slaap_minuten != null
    ? computeSleepScore(todayRow)
    : sleepRows7.length >= 2
      ? Math.round(sleepRows7.reduce((s, r) => s + (computeSleepScore(r) ?? 0), 0) / sleepRows7.length)
      : null
  const hrvBaseline = computeHRVBaseline(rows)

  const settings      = data?.settings
  const foodLogToday  = data?.foodLogToday ?? []
  const calendarEvents = data?.calendarEvents ?? []
  const todayEvent    = calendarEvents.find((e: any) => isToday(e) && isSport(e)) ?? null

  const totalProtein  = foodLogToday.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(settings?.macro_protein ?? 180)
  const proteinLeft   = Math.round(Math.max(0, targetProtein - totalProtein))
  const steps         = data?.latestGezondheid?.stappen ?? 0
  const stepGoal      = Number(settings?.step_goal ?? 10000)

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

  // Paragraph
  let paragraph = ''
  if (readiness.score !== null && readiness.score >= 75) {
    paragraph = 'Recovery is strong today.'
    if (todayEvent) {
      const isCardio = CARDIO_KW.some(kw => todayEvent.title.toLowerCase().includes(kw))
      paragraph += ` A ${isCardio ? 'cardio session' : 'workout'} will support recovery and build weekly volume.`
    } else {
      paragraph += ' Good day for a quality session.'
    }
    paragraph += proteinLeft > 30 ? ` Still ${proteinLeft}g short on protein.` : ' Nutrition is on track.'
  } else if (readiness.score !== null && readiness.score >= 50) {
    paragraph = 'Readiness is moderate today.'
    if (sleepScore !== null && sleepScore < 60) paragraph += ' Sleep was not optimal.'
    if (hrvBaseline.deviationPct !== null && hrvBaseline.deviationPct < -10) {
      paragraph += ` HRV is ${Math.abs(hrvBaseline.deviationPct)}% below baseline.`
    }
    paragraph += ' Keep intensity low and prioritise recovery.'
    if (proteinLeft > 30) paragraph += ` ${proteinLeft}g of protein left to go.`
  } else if (readiness.score !== null) {
    paragraph = 'Readiness is low.'
    if (sleepScore !== null && sleepScore < 55) paragraph += ' Sleep was poor.'
    paragraph += ' Consider a rest day or light walk.'
    if (proteinLeft > 30) paragraph += ` Prioritise ${proteinLeft}g protein for recovery.`
  } else {
    if (todayEvent) {
      paragraph = `${todayEvent.title} is on the schedule today.`
      paragraph += proteinLeft > 30
        ? ` Get ${proteinLeft}g more protein for better performance.`
        : ' Nutrition is on track.'
    } else if (proteinLeft > 40) {
      paragraph = `Protein intake is behind. Get ${proteinLeft}g more before end of day.`
    } else {
      paragraph = 'You are on track today. Stay consistent.'
    }
  }

  // Interpretive bullets — no raw numbers, no duplication of Focus items
  const bullets: string[] = []
  const hour = new Date().getHours()
  const totalKcal    = foodLogToday.reduce((s: number, f: any) => s + Number(f.kcal ?? 0), 0)
  const targetKcal   = Number(settings?.macro_kcal ?? 2000)
  const expectedFrac = Math.max(0, Math.min(1, (hour - 6) / 18))

  if (foodLogToday.length > 0) {
    const calPct = targetKcal > 0 ? totalKcal / targetKcal : 0
    if (calPct > expectedFrac + 0.15)       bullets.push('Calorie intake is ahead of schedule')
    else if (calPct >= expectedFrac - 0.12) bullets.push('Calories are on track')
    else                                     bullets.push('Calorie intake is behind schedule')
  }

  if (foodLogToday.length > 0) {
    if (proteinLeft <= 0) {
      bullets.push('Protein goal already reached today')
    } else {
      const hoursLeft     = Math.max(1, 22 - hour)
      const neededPerHour = proteinLeft / hoursLeft
      if (neededPerHour <= 15)      bullets.push('A protein-rich dinner will likely hit your goal')
      else if (neededPerHour <= 30) bullets.push('Prioritise protein at every remaining meal')
      else                          bullets.push('Protein is the main focus today')
    }
  }

  if (steps > 0) {
    const projected = Math.round(steps * (18 / Math.max(1, hour - 6)))
    if (steps >= stepGoal)           bullets.push('Step goal already reached')
    else if (projected >= stepGoal)  bullets.push('Step goal is achievable at current pace')
    else                             bullets.push('Steps are your biggest focus today')
  }

  return { status, title, paragraph, bullets: bullets.slice(0, 3) }
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

// ─── Risks & Opportunities builder ───────────────────────────────────────────

function buildRisksOps(data: any, rows: HealthRow[]) {
  const items: { type: 'opportunity' | 'watch' | 'risk'; text: string }[] = []
  const settings      = data?.settings
  const foodLog7d     = data?.foodLog7d ?? []
  const foodLogToday  = data?.foodLogToday ?? []
  const targetProtein = Number(settings?.macro_protein ?? 180)
  const stepGoal      = Number(settings?.step_goal ?? 10000)
  const steps         = data?.latestGezondheid?.stappen ?? 0

  const hour = new Date().getHours()

  // Protein streak (triggers from 2 consecutive days)
  const proteinByDate: Record<string, number> = {}
  for (const row of foodLog7d) {
    const d = row.date as string
    proteinByDate[d] = (proteinByDate[d] ?? 0) + Number(row.protein ?? 0)
  }
  const todayProtein = foodLogToday.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  let streak = 0
  const check = new Date(); check.setDate(check.getDate() - 1)
  for (let i = 0; i < 6; i++) {
    const d = check.toISOString().split('T')[0]
    if ((proteinByDate[d] ?? 0) >= targetProtein) { streak++; check.setDate(check.getDate() - 1) }
    else break
  }
  if (streak >= 2) {
    items.push(todayProtein >= targetProtein
      ? { type: 'opportunity', text: `Protein goal hit ${streak + 1} days in a row` }
      : { type: 'opportunity', text: `Hit protein today for a ${streak + 1}-day streak` }
    )
  }

  // Weekly cardio completion
  const calendarEvents = data?.calendarEvents ?? []
  const todayEvent = calendarEvents.find((e: any) => isToday(e) && isSport(e)) ?? null
  const todayIsCardio = todayEvent && CARDIO_KW.some(kw => todayEvent.title.toLowerCase().includes(kw))
  const cardioActs = (data?.todayActivities ?? []).filter((a: any) =>
    CARDIO_SPORT_TYPES.some(ct => (a.sport_type ?? '').toLowerCase().includes(ct))
  )
  if (todayIsCardio && cardioActs.length === 0) {
    const endOfWeek = new Date(); endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()))
    const moreCardio = calendarEvents.some((e: any) => {
      const d = e.start_datetime ? new Date(e.start_datetime) : new Date(e.start_date + 'T00:00:00')
      return d >= tom0() && d <= endOfWeek && CARDIO_KW.some(kw => e.title.toLowerCase().includes(kw))
    })
    if (!moreCardio) {
      items.push({ type: 'opportunity', text: "Finish weekly cardio after tonight's session" })
    }
  }

  // Step projection — triggers from 8am, broader threshold
  if (steps > 0 && steps < stepGoal) {
    const projected = Math.round(steps * (18 / Math.max(1, hour - 6)))
    if (hour >= 8 && projected < stepGoal * 0.9) {
      items.push({ type: 'watch', text: `At current pace you'll end at ~${projected.toLocaleString('en-US')} steps` })
    } else if (steps >= stepGoal * 0.9) {
      items.push({ type: 'opportunity', text: `${(stepGoal - steps).toLocaleString('en-US')} steps to daily goal` })
    }
  } else if (steps >= stepGoal) {
    items.push({ type: 'opportunity', text: 'Step goal already reached today' })
  }

  // Calorie risk — over target
  const totalKcal  = foodLogToday.reduce((s: number, f: any) => s + Number(f.kcal ?? 0), 0)
  const targetKcal = Number(settings?.macro_kcal ?? 2000)
  if (foodLogToday.length > 0 && totalKcal > targetKcal * 1.12) {
    items.push({ type: 'risk', text: `${Math.round(totalKcal - targetKcal)} kcal over daily goal` })
  }

  // Sleep trend (3+ days declining)
  const sleepRows = rows.filter(r => r.slaap_minuten != null).slice(0, 4)
  if (sleepRows.length >= 3) {
    const scores = sleepRows.map(r => computeSleepScore(r) ?? 0)
    if (scores[0] < scores[1] && scores[1] < scores[2] && scores[0] < 65) {
      const days = sleepRows.length >= 4 && scores[2] < scores[3] ? 4 : 3
      items.push({ type: 'risk', text: `Sleep quality declining for ${days} days in a row` })
    }
  }

  const order = { opportunity: 0, watch: 1, risk: 2 }
  return items.sort((a, b) => order[a.type] - order[b.type]).slice(0, 4)
}

// ─── UI ───────────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  green:  { bg: 'rgba(45,212,191,0.08)',  border: 'rgba(45,212,191,0.2)',  dot: '#2dd4bf' },
  yellow: { bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.2)',  dot: '#fb923c' },
  red:    { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', dot: '#f87171' },
}

function CoachCard({ coach }: { coach: ReturnType<typeof buildCoach> }) {
  const cfg = STATUS_CFG[coach.status]
  return (
    <div className="p-5 rounded-[24px] border" style={{ background: cfg.bg, borderColor: cfg.border }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cfg.dot }} />
        <span className="text-[18px] font-bold text-white">{coach.title}</span>
      </div>
      <p className="text-[14px] text-white/70 leading-relaxed mb-4">{coach.paragraph}</p>
      {coach.bullets.length > 0 && (
        <div className="flex flex-col gap-2 pt-3 border-t border-white/[0.08]">
          {coach.bullets.map((b, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-white/25 text-[12px] mt-[3px] shrink-0">•</span>
              <span className="text-[13px] font-medium text-white/70">{b}</span>
            </div>
          ))}
        </div>
      )}
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

const RO_CFG = {
  opportunity: { dot: '#2dd4bf', label: 'Opportunity' },
  watch:       { dot: '#fb923c', label: 'Watch' },
  risk:        { dot: '#f87171', label: 'Risk' },
}

function RisksOpsCard({ items }: { items: ReturnType<typeof buildRisksOps> }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em] mb-3">Risks & Opportunities</p>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => {
          const cfg = RO_CFG[item.type]
          return (
            <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-[14px] border border-white/[0.07]" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="w-2 h-2 rounded-full shrink-0 mt-[5px]" style={{ background: cfg.dot }} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] mb-0.5" style={{ color: cfg.dot }}>{cfg.label}</p>
                <p className="text-[13px] text-white/65 leading-snug">{item.text}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProgressBar({ label, current, target, unit, color, note, noteColor }: {
  label: string; current: number; target: number; unit: string; color: string
  note?: string; noteColor?: string
}) {
  const pct = target > 0 ? Math.min(current / target, 1) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] font-medium text-white/30 w-[52px] shrink-0">{label}</span>
      <div className="flex-1 h-[4px] rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <div className="flex flex-col items-end w-[80px] shrink-0">
        <span className="text-[11px] text-white/25 tabular-nums leading-none">
          {Math.round(current)}<span className="opacity-70">/{target}{unit}</span>
        </span>
        {note && (
          <span className="text-[10px] font-semibold leading-none mt-0.5" style={{ color: noteColor ?? 'rgba(255,255,255,0.3)' }}>
            {note}
          </span>
        )}
      </div>
    </div>
  )
}

function ProgressCard({ data }: { data: any }) {
  const foodLog  = data?.foodLogToday ?? []
  const settings = data?.settings
  if (!settings) return null

  const t = foodLog.reduce((s: any, f: any) => ({
    kcal:    s.kcal    + Number(f.kcal    ?? 0),
    protein: s.protein + Number(f.protein ?? 0),
    carbs:   s.carbs   + Number(f.carbs   ?? 0),
    fat:     s.fat     + Number(f.fat     ?? 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })

  const steps    = data?.latestGezondheid?.stappen ?? 0
  const stepGoal = Number(settings.step_goal ?? 10000)

  const hour         = new Date().getHours()
  const expectedFrac = Math.max(0, Math.min(1, (hour - 6) / 18))

  function macroNote(current: number, target: number): { note: string; color: string } | undefined {
    if (target <= 0 || current === 0) return undefined
    const pct  = current / target
    const diff = pct - expectedFrac
    if (pct >= 1)        return { note: 'Done',       color: '#2dd4bf' }
    if (diff > 0.15)     return { note: 'Ahead',      color: '#2dd4bf' }
    if (diff >= -0.1)    return { note: 'On track',   color: 'rgba(255,255,255,0.4)' }
    if (diff >= -0.25)   return { note: 'Behind',     color: '#fb923c' }
    return               { note: 'Way behind',        color: '#f87171' }
  }

  function stepsNote(current: number, target: number): { note: string; color: string } | undefined {
    if (current === 0) return undefined
    if (current >= target) return { note: 'Done',     color: '#2dd4bf' }
    const projected = Math.round(current * (18 / Math.max(1, hour - 6)))
    if (projected >= target)              return { note: 'On track',   color: 'rgba(255,255,255,0.4)' }
    if (projected >= target * 0.85)      return { note: 'Almost',     color: '#fb923c' }
    return                                { note: 'Behind',            color: '#f87171' }
  }

  const kcalN   = macroNote(t.kcal,    Number(settings.macro_kcal    ?? 2000))
  const eiwitN  = macroNote(t.protein, Number(settings.macro_protein ?? 180))
  const carbsN  = macroNote(t.carbs,   Number(settings.macro_carbs   ?? 250))
  const vetN    = macroNote(t.fat,     Number(settings.macro_fat     ?? 70))
  const stapsN  = stepsNote(steps, stepGoal)

  return (
    <div>
      <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em] mb-3">Progress</p>
      <a href="/food" className="block active:opacity-70 transition-opacity">
        <div className="flex flex-col gap-4 px-4 py-4 rounded-[18px] border border-white/[0.07]" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <ProgressBar label="Kcal"    current={t.kcal}    target={Number(settings.macro_kcal    ?? 2000)} unit=""  color="rgb(251,146,60)"  note={kcalN?.note}  noteColor={kcalN?.color} />
          <ProgressBar label="Protein" current={t.protein} target={Number(settings.macro_protein ?? 180)}  unit="g" color="rgb(45,212,191)"  note={eiwitN?.note} noteColor={eiwitN?.color} />
          <ProgressBar label="Carbs"   current={t.carbs}   target={Number(settings.macro_carbs   ?? 250)}  unit="g" color="rgb(163,230,53)"  note={carbsN?.note} noteColor={carbsN?.color} />
          <ProgressBar label="Fat"     current={t.fat}     target={Number(settings.macro_fat     ?? 70)}   unit="g" color="rgb(250,204,21)"  note={vetN?.note}   noteColor={vetN?.color} />
          {steps > 0 && (
            <ProgressBar label="Steps"   current={steps} target={stepGoal} unit="" color="rgb(129,140,248)" note={stapsN?.note} noteColor={stapsN?.color} />
          )}
        </div>
      </a>
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
  const rows = gezondheid ?? []

  // Prefer steps from the health-gezondheid cache (kept fresh by DataProvider auto-sync)
  // over the today-fetch result, which may have run before today's Fitbit sync completed.
  const todayStr = localDateStr()
  const todayHealthRow = rows.find(r => r.datum === todayStr)
  const effectiveData = data && todayHealthRow?.stappen != null
    ? { ...data, latestGezondheid: { ...(data.latestGezondheid ?? {}), stappen: todayHealthRow.stappen } }
    : data

  const coach    = buildCoach(rows, effectiveData)
  const focus    = buildFocusItems(effectiveData)
  const risksOps = buildRisksOps(effectiveData, rows)

  return (
    <PremiumScreen title="Today" subtitle={formatSubtitle()}>
      <div style={{ opacity: data ? 1 : 0, transition: 'opacity 0.15s ease' }}>
      <CoachCard coach={coach} />
      <FocusCard items={focus} />
      <RisksOpsCard items={risksOps} />
      <ProgressCard data={effectiveData} />
      <UpcomingCard events={effectiveData?.calendarEvents ?? []} />
      </div>
    </PremiumScreen>
  )
}
