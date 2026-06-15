'use client'

import { useState } from 'react'
import { ArrowUp, Copy, Check, X } from 'lucide-react'
import useSWR from 'swr'
import { PremiumScreen } from '@/components/PremiumScreen'
import { CoachRecommendation } from '@/components/ui'
import {
  computePhysiologyReadiness, computeIllnessFlag, computeHRVBaseline, type HealthRow,
} from '@/lib/readiness'
import type { Activity, HevyWorkout } from '@/app/training/sections'
import { healthFetcher } from '@/app/health/fetcher'
import { trainingFetcher } from '@/app/training/fetcher'
import { fetchFoodData } from '@/app/food/fetchers'

type Rec = { title: string; text: string }

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtMin(min: number) {
  const total = Math.round(min)
  const h = Math.floor(total / 60), m = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function startOfWeek(d = new Date()): Date {
  const day = new Date(d); day.setHours(0,0,0,0)
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  return day
}

// ─── Baselines ────────────────────────────────────────────────────────────────

function computeBaselines(rows: HealthRow[]) {
  const hist = rows.slice(1, 31)   // skip today, last 30 days
  const hrvVals = hist.filter(r => r.hrv_rmssd != null).map(r => r.hrv_rmssd as number)
  const rhrVals = hist.filter(r => r.hartslag_rust != null).map(r => r.hartslag_rust as number)
  const sleepVals = hist.filter(r => r.slaap_minuten != null).map(r => r.slaap_minuten as number)
  const mean = (a: number[]) => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10 : null
  return {
    hrv:   mean(hrvVals),
    rhr:   mean(rhrVals),
    sleep: mean(sleepVals),
  }
}

// ─── Training load ────────────────────────────────────────────────────────────

function computeTrainingLoad(activities: Activity[]) {
  const now  = Date.now()
  const d7   = new Date(now - 7  * 86400000).toISOString()
  const d14  = new Date(now - 14 * 86400000).toISOString()
  const d28  = new Date(now - 28 * 86400000).toISOString()

  const minOf = (a: Activity) => (a.moving_time ?? 0) / 60

  // All windows are rolling so they're directly comparable
  const acute7Min    = activities.filter(a => a.start_date >= d7).reduce((s, a) => s + minOf(a), 0)
  const prev7Min     = activities.filter(a => a.start_date >= d14 && a.start_date < d7).reduce((s, a) => s + minOf(a), 0)
  const chronic28Min = activities.filter(a => a.start_date >= d28).reduce((s, a) => s + minOf(a), 0)
  const chronic28Avg = chronic28Min / 4  // avg weekly load over last 4 weeks

  const acwr     = chronic28Avg > 10 ? Math.round((acute7Min / chronic28Avg) * 100) / 100 : null
  const rampRate = prev7Min > 10 ? Math.round(((acute7Min - prev7Min) / prev7Min) * 100) : null

  // Consecutive training days (rolling back from today; skip today if no session yet)
  let consecutiveDays = 0
  const hasActivityToday = activities.some(a => a.start_date.slice(0, 10) === new Date(now).toISOString().slice(0, 10))
  const startOffset = hasActivityToday ? 0 : 1
  for (let i = startOffset; i < 21; i++) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10)
    if (activities.some(a => a.start_date.slice(0, 10) === d)) consecutiveDays++
    else break
  }

  return { acute7Min, prev7Min, chronic28Avg, acwr, rampRate, consecutiveDays }
}

// ─── Muscle recovery ──────────────────────────────────────────────────────────

type MuscleGroup = 'Push (chest/shoulders/triceps)' | 'Pull (back/biceps)' | 'Legs' | 'Core'

const MUSCLE_MAP: Array<{ group: MuscleGroup; keywords: string[]; recoveryH: number }> = [
  { group: 'Push (chest/shoulders/triceps)', keywords: ['push', 'chest', 'bench', 'shoulder', 'tricep'], recoveryH: 48 },
  { group: 'Pull (back/biceps)',             keywords: ['pull', 'back', 'row', 'chin', 'lat', 'bicep'],  recoveryH: 48 },
  { group: 'Legs',                           keywords: ['leg', 'squat', 'deadlift', 'lunge', 'lower'],   recoveryH: 72 },
  { group: 'Core',                           keywords: ['abs', 'core', 'plank'],                         recoveryH: 24 },
]

function computeMuscleRecovery(activities: Activity[], hevy: HevyWorkout[]): Array<{ group: MuscleGroup; pct: number; lastSession: string | null }> {
  const now = Date.now()
  const allSessions: Array<{ date: string; title: string }> = [
    ...activities.filter(a => a.sport_type?.toLowerCase().includes('weight') || a.sport_type?.toLowerCase().includes('strength')).map(a => ({ date: a.start_date, title: a.name ?? '' })),
    ...hevy.map(w => ({ date: w.start_time ?? '', title: w.title ?? '' })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return MUSCLE_MAP.map(({ group, keywords, recoveryH }) => {
    const last = allSessions.find(s => keywords.some(kw => s.title.toLowerCase().includes(kw)))
    if (!last) return { group, pct: 100, lastSession: null }
    const hoursElapsed = (now - new Date(last.date).getTime()) / 3600000
    const pct = Math.min(100, Math.round((hoursElapsed / recoveryH) * 100))
    return { group, pct, lastSession: last.date.slice(0, 10) }
  })
}

// ─── buildRecs (unchanged logic) ─────────────────────────────────────────────

function buildRecs(
  healthRows: HealthRow[], activities: Activity[], calendarEvents: any[], foodData: any,
): Rec[] {
  const recs: Rec[] = []
  const now = Date.now()
  const d7  = new Date(now - 7  * 86400000).toISOString()
  const d28 = new Date(now - 28 * 86400000).toISOString()
  const todayStr    = new Date(now).toISOString().slice(0, 10)
  const tomorrowStr = new Date(now + 86400000).toISOString().slice(0, 10)

  const readiness = computePhysiologyReadiness(healthRows)
  const illness   = computeIllnessFlag(healthRows)

  if (illness) {
    recs.push({ title: 'Strain detected — rest today', text: `Multiple signals are outside baseline (${illness.reason}). Rest or a slow walk only.` })
  } else if (readiness.score !== null) {
    const todayEvent    = calendarEvents.find(e => (e.start_datetime || e.start_date || '').slice(0, 10) === todayStr)
    const tomorrowEvent = calendarEvents.find(e => (e.start_datetime || e.start_date || '').slice(0, 10) === tomorrowStr)
    const nextEvent     = todayEvent ?? tomorrowEvent
    if (readiness.score >= 80) recs.push({ title: nextEvent ? `Ready for ${nextEvent.title}` : 'Full intensity available', text: `Readiness ${readiness.score} (${readiness.label}) — HRV and sleep above baseline.` })
    else if (readiness.score >= 65) recs.push({ title: 'Moderate intensity only', text: `Readiness ${readiness.score} — Zone 2 or technique work. Avoid threshold or max-effort.` })
    else if (readiness.score >= 50) recs.push({ title: 'Light session or rest', text: `Readiness ${readiness.score} — below baseline. Rest accelerates tomorrow more than a hard session.` })
    else recs.push({ title: 'Rest recommended', text: `Readiness ${readiness.score} (${readiness.label}). Multiple markers low. Quality sleep returns more than any workout today.` })
  }

  const minOf = (a: Activity) => (a.moving_time ?? 0) / 60
  const acute7   = activities.filter(a => a.start_date >= d7).reduce((s, a) => s + minOf(a), 0)
  const chronic28 = activities.filter(a => a.start_date >= d28).reduce((s, a) => s + minOf(a), 0)
  const acwr = chronic28 / 4 > 10 ? Math.round((acute7 / (chronic28 / 4)) * 100) / 100 : null

  if (acwr !== null) {
    if (acwr > 1.4) recs.push({ title: 'Reduce volume this week', text: `ACWR ${acwr} — 7-day load is ${Math.round(acwr * 100)}% of 28-day avg. Above 1.3 raises injury risk. Cut 20–30%.` })
    else if (acwr < 0.7 && activities.length > 3) recs.push({ title: 'Volume below baseline', text: `ACWR ${acwr} — lighter than chronic average. Safe to push if readiness supports it.` })
  }

  const logs = Array.isArray(foodData) ? foodData : (foodData?.food_log ?? foodData?.foodLog ?? [])
  const totalProtein  = logs.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(foodData?.targets?.protein ?? 0)
  if (targetProtein > 0 && totalProtein < targetProtein - 30) recs.push({ title: `${Math.round(targetProtein - totalProtein)}g protein remaining`, text: `${Math.round(totalProtein)}g of ${Math.round(targetProtein)}g logged. Prioritise protein in your next meal.` })
  else if (targetProtein > 0 && totalProtein >= targetProtein) recs.push({ title: 'Protein goal reached', text: `${Math.round(totalProtein)}g logged. Stay consistent tomorrow — recovery runs 24–48h.` })

  const sleepRows = healthRows.filter(r => r.slaap_minuten != null)
  if (sleepRows.length >= 3) {
    const avg7 = sleepRows.slice(0, 7).reduce((s, r) => s + (r.slaap_minuten ?? 0), 0) / Math.min(sleepRows.length, 7)
    const last = sleepRows[0]?.slaap_minuten ?? null
    if (avg7 < 400) recs.push({ title: 'Sleep debt accumulating', text: `7-day avg ${Math.floor(avg7/60)}h ${Math.round(avg7%60)}m — below 7h minimum. Lights-out 22:30, caffeine cutoff 13:00.` })
    else if (last !== null && last < 360) recs.push({ title: 'Short night — protect tonight', text: `Last night: ${Math.floor(last/60)}h ${last%60}m. Screens off 22:00, target 7–8h.` })
  }

  const tomorrowEvt = calendarEvents.find(e => (e.start_datetime || e.start_date || '').slice(0, 10) === tomorrowStr)
  if (tomorrowEvt && recs.length < 5) recs.push({ title: `Prepare for ${tomorrowEvt.title}`, text: `Sleep before 23:00, hit protein target, stay hydrated.` })

  return recs.slice(0, 5)
}

// ─── buildPrompt ──────────────────────────────────────────────────────────────

function buildPrompt(
  userMessage: string,
  goal: string,
  trainingGoalKey: string,
  healthRows: HealthRow[],
  activities: Activity[],
  hevy: HevyWorkout[],
  calendarEvents: any[],
  foodData: any,
): string {
  const today     = new Date().toISOString().slice(0, 10)
  const readiness = computePhysiologyReadiness(healthRows)
  const illness   = computeIllnessFlag(healthRows)
  const baselines = computeBaselines(healthRows)
  const load      = computeTrainingLoad(activities)
  const muscle    = computeMuscleRecovery(activities, hevy)
  const hrvBase   = computeHRVBaseline(healthRows)

  const todayHealth   = healthRows.find(r => r.datum === today)
  const sleepRows     = healthRows.filter(r => r.slaap_minuten != null).slice(0, 7)
  const logs          = Array.isArray(foodData) ? foodData : (foodData?.food_log ?? foodData?.foodLog ?? [])
  const targetProtein = Number(foodData?.targets?.protein ?? 0)
  const targetKcal    = Number(foodData?.targets?.kcal ?? 0)
  const totalProtein  = logs.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const totalKcal     = logs.reduce((s: number, f: any) => s + Number(f.kcal ?? 0), 0)

  const recentActivities = activities.slice(0, 10).map(a =>
    `  - ${a.start_date?.slice(0, 10)} ${a.sport_type ?? ''} ${a.name ?? ''} — ${Math.round((a.moving_time ?? 0) / 60)} min${a.distance ? `, ${(a.distance / 1000).toFixed(1)} km` : ''}`
  ).join('\n')

  const upcomingEvents = calendarEvents
    .filter(e => (e.start_datetime || e.start_date || '') >= today)
    .slice(0, 5)
    .map(e => `  - ${(e.start_datetime || e.start_date || '').slice(0, 10)} ${e.title}`)
    .join('\n')

  const sleepSummary = sleepRows.map(r =>
    `  - ${r.datum}: ${r.slaap_minuten ? fmtMin(r.slaap_minuten) : '–'}${r.slaap_score != null ? `, score ${r.slaap_score}` : ''}${r.hrv_rmssd != null ? `, HRV ${r.hrv_rmssd} ms` : ''}`
  ).join('\n')

  const muscleSummary = muscle.map(m =>
    `  - ${m.group}: ${m.pct}% recovered${m.lastSession ? ` (last trained ${m.lastSession})` : ' (no recent data)'}`
  ).join('\n')

  const GOAL_PRIORITY: Record<string, string> = {
    lose_weight:   '1. Recovery\n2. Adherence\n3. Fat loss\n4. Performance',
    build_muscle:  '1. Recovery\n2. Progressive overload\n3. Protein intake\n4. Cardiovascular fitness',
    get_fitter:    '1. Recovery\n2. Aerobic load\n3. Consistency\n4. Performance metrics',
    maintain:      '1. Consistency\n2. Recovery\n3. Balance across modalities',
    performance:   '1. Performance\n2. Recovery\n3. Training specificity\n4. Volume management',
  }
  const priority = GOAL_PRIORITY[trainingGoalKey] ?? null

  const system = `You are a data-driven fitness and health coach. You analyse the user's biometric data, training load, sleep, and nutrition and give concise, evidence-based advice. Be direct and specific — no generic tips. Always refer to the actual numbers in the data.`

  const context = `## User context — ${today}
${goal || priority ? `
### Coaching priority
Primary goal: ${goal || '–'}
${priority ? `\nPriority order:\n${priority}` : ''}
` : ''}
### Recovery & readiness
- Readiness score: ${readiness.score ?? '–'} / 100 (${readiness.label})
- HRV today: ${todayHealth?.hrv_rmssd != null ? `${todayHealth.hrv_rmssd} ms` : '–'}
- HRV 30-day baseline: ${baselines.hrv != null ? `${baselines.hrv} ms` : '–'}${hrvBase.deviationPct != null ? ` (today ${hrvBase.deviationPct > 0 ? '+' : ''}${hrvBase.deviationPct}%)` : ''}
- Resting HR today: ${todayHealth?.hartslag_rust != null ? `${todayHealth.hartslag_rust} bpm` : '–'}
- Resting HR 30-day baseline: ${baselines.rhr != null ? `${baselines.rhr} bpm` : '–'}
- Illness / strain flag: ${illness ? illness.reason : 'none'}
${readiness.explanation ? `- Readiness note: ${readiness.explanation}` : ''}

### Sleep (last 7 nights)
- 30-day avg sleep duration: ${baselines.sleep != null ? fmtMin(baselines.sleep) : '–'}
${sleepSummary || '  No data'}

### Training load
- Last 7 days: ${fmtMin(load.acute7Min)} (prev 7 days: ${fmtMin(load.prev7Min)})
- 28-day avg weekly volume: ${fmtMin(load.chronic28Avg)}
- ACWR (7-day / 28-day avg): ${load.acwr != null ? load.acwr : '–'}${load.acwr != null && load.acwr > 1.3 ? ' ⚠ elevated injury risk' : ''}
- Ramp rate (this vs prev 7 days): ${load.rampRate != null ? `${load.rampRate > 0 ? '+' : ''}${load.rampRate}%` : '–'}
- Consecutive training days: ${load.consecutiveDays}

### Training (last 10 sessions)
${recentActivities || '  No activities'}

### Muscle recovery (time-based estimate)
${muscleSummary}

### Nutrition today
- Calories: ${Math.round(totalKcal)} kcal${targetKcal ? ` / ${targetKcal} kcal target` : ''}
- Protein: ${Math.round(totalProtein)}g${targetProtein ? ` / ${Math.round(targetProtein)}g target` : ''}

### Upcoming calendar events
${upcomingEvents || '  None'}

---
## User message
${userMessage}`

  return `SYSTEM:\n${system}\n\nUSER:\n${context}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoachPage() {
  const [message, setMessage] = useState('')
  const [prompt, setPrompt]   = useState<string | null>(null)
  const [copied, setCopied]   = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const { data: healthRows = [] } = useSWR<HealthRow[]>('health-gezondheid', healthFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const { data: training }        = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const { data: foodData }        = useSWR(`food-log-${today}`, () => fetchFoodData(today), { revalidateOnFocus: false, dedupingInterval: 60_000 })

  const activities     = training?.activities ?? []
  const hevy           = training?.hevy ?? []
  const calendarEvents = training?.calendarEvents ?? []
  const goal           = training?.trainingGoal?.replace(/_/g, ' ') ?? ''
  const foodForRecs    = foodData ? { food_log: foodData.foodLog, targets: foodData.targets } : null
  const recs           = buildRecs(healthRows, activities, calendarEvents, foodForRecs)
  const hasData        = healthRows.length > 0 || activities.length > 0

  function handleSend() {
    if (!message.trim()) return
    const full = buildPrompt(message, goal, training?.trainingGoal ?? '', healthRows, activities, hevy, calendarEvents, foodForRecs)
    setPrompt(full)
    setMessage('')
  }

  async function copyPrompt() {
    if (!prompt) return
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <PremiumScreen title="Coach" subtitle="Objective recommendations" contentGap={18}>

      {/* Recs */}
      {hasData ? (
        recs.length > 0 ? (
          recs.map((rec, i) => <CoachRecommendation key={i} rank={String(i + 1).padStart(2, '0')} title={rec.title} text={rec.text} />)
        ) : (
          <div className="px-4 py-8 rounded-2xl text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <p className="text-[15px] text-white/40">All signals look good — no specific actions needed today.</p>
          </div>
        )
      ) : (
        <div className="px-4 py-8 rounded-2xl text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <p className="text-[15px] text-white/40">Connect Fitbit and log training to see personalised recommendations.</p>
        </div>
      )}

      {/* Prompt debug view */}
      {prompt && (
        <div className="rounded-[18px] border border-white/[0.1] overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
            <span className="text-[12px] font-semibold text-white/40 uppercase tracking-[0.10em]">Prompt that would be sent</span>
            <div className="flex items-center gap-2">
              <button onClick={copyPrompt} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors" style={{ background: 'rgba(255,255,255,0.08)', color: copied ? '#4ade80' : 'rgba(255,255,255,0.6)' }}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={() => setPrompt(null)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <X size={14} className="text-white/50" />
              </button>
            </div>
          </div>
          <pre className="px-4 py-4 text-[12px] text-white/60 leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono">
            {prompt}
          </pre>
        </div>
      )}

      {/* Chat input */}
      <div className="flex items-center gap-3 pt-2.5">
        <input
          type="text"
          placeholder="Ask your coach…"
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          className="flex-1 h-[52px] px-4 rounded-[18px] text-white placeholder:text-white/30 outline-none text-[17px]"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        />
        <button
          onClick={handleSend}
          aria-label="Send message"
          className="w-[52px] h-[52px] rounded-full bg-white flex items-center justify-center shrink-0 disabled:opacity-30"
          disabled={!message.trim()}
        >
          <ArrowUp size={20} className="text-black" strokeWidth={2.5} />
        </button>
      </div>
    </PremiumScreen>
  )
}
