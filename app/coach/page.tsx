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
import { computeMuscleGroupAdvice } from '@/app/training/sections'
import { computeTrainingLoadScore, computeRampRate } from '@/lib/training-load'
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

// RHR + sleep 30-day means (HRV baseline comes from computeHRVBaseline)
function computeSimpleBaselines(rows: HealthRow[]) {
  const hist = rows.slice(1, 31)
  const mean = (a: number[]) => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10 : null
  return {
    rhr:   mean(hist.filter(r => r.hartslag_rust != null).map(r => r.hartslag_rust as number)),
    sleep: mean(hist.filter(r => r.slaap_minuten != null).map(r => r.slaap_minuten as number)),
  }
}

// ─── buildRecs (unchanged logic) ─────────────────────────────────────────────

function buildRecs(
  healthRows: HealthRow[], activities: Activity[], hevy: HevyWorkout[], calendarEvents: any[], foodData: any,
): Rec[] {
  const recs: Rec[] = []
  const now = Date.now()
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

  const { acwr } = computeTrainingLoadScore(activities, hevy)
  if (acwr !== null) {
    const acwrR = Math.round(acwr * 100) / 100
    if (acwr > 1.4) recs.push({ title: 'Reduce volume this week', text: `ACWR ${acwrR} — 7-day load is ${Math.round(acwr * 100)}% of 28-day avg. Above 1.3 raises injury risk. Cut 20–30%.` })
    else if (acwr < 0.7 && activities.length > 3) recs.push({ title: 'Volume below baseline', text: `ACWR ${acwrR} — lighter than chronic average. Safe to push if readiness supports it.` })
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
  const baselines = computeSimpleBaselines(healthRows)
  const load      = computeTrainingLoadScore(activities, hevy)   // intensity-weighted ACWR, volume, consecutive days
  const rampRate  = computeRampRate(activities, hevy)
  const muscle    = computeMuscleGroupAdvice(hevy)               // per-group recovery % + train/possible/rest
  const hrvBase   = computeHRVBaseline(healthRows)

  const todayHealth   = healthRows.find(r => r.datum === today)
  const sleepRows     = healthRows.filter(r => r.slaap_minuten != null).slice(0, 7)
  const logs          = Array.isArray(foodData) ? foodData : (foodData?.food_log ?? foodData?.foodLog ?? [])
  const targetProtein = Number(foodData?.targets?.protein ?? 0)
  const targetKcal    = Number(foodData?.targets?.kcal ?? 0)
  const totalProtein  = logs.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const totalKcal     = logs.reduce((s: number, f: any) => s + Number(f.kcal ?? 0), 0)

  // Compact HRV line: "86.7 ms / baseline 108.4 ms (-20%)"
  const hrvToday = todayHealth?.hrv_rmssd
  const hrvDev   = hrvBase.deviationPct
  const hrvLine  = hrvToday != null
    ? `${hrvToday} ms${hrvBase.baseline != null ? ` / baseline ${hrvBase.baseline} ms` : ''}${hrvDev != null ? ` (${hrvDev > 0 ? '+' : ''}${hrvDev}%)` : ''}`
    : '–'

  // Compact RHR line: "58 bpm / baseline 54 bpm (+7%)"
  const rhrToday = todayHealth?.hartslag_rust
  const rhrDev   = rhrToday != null && baselines.rhr != null
    ? Math.round((rhrToday - baselines.rhr) / baselines.rhr * 100)
    : null
  const rhrLine  = rhrToday != null
    ? `${rhrToday} bpm${baselines.rhr != null ? ` / baseline ${baselines.rhr} bpm` : ''}${rhrDev != null ? ` (${rhrDev > 0 ? '+' : ''}${rhrDev}%)` : ''}`
    : '–'

  // Training load summary: "2 strength, 1 run — 3h12m, ACWR 1.25 (optimal), ramp +8%"
  const t7       = new Date(Date.now() - 7 * 86400000).toISOString()
  const acts7    = activities.filter(a => a.start_date >= t7)
  const hevy7    = hevy.filter(h => h.start_time >= t7)
  const sportMap: Record<string, number> = {}
  for (const a of acts7) { const k = (a.sport_type ?? 'other').toLowerCase(); sportMap[k] = (sportMap[k] ?? 0) + 1 }
  if (hevy7.length) sportMap['strength'] = (sportMap['strength'] ?? 0) + hevy7.length
  const totalMin7  = acts7.reduce((s, a) => s + (a.moving_time ?? 0) / 60, 0)
                   + hevy7.reduce((s, h) => s + (h.duration ?? 0) / 60, 0)
  const loadLine   = [
    Object.entries(sportMap).length ? Object.entries(sportMap).map(([k, v]) => `${v} ${k}`).join(', ') : 'no sessions',
    totalMin7 > 0 ? fmtMin(totalMin7) : null,
    `ACWR ${load.acwr != null ? Math.round(load.acwr * 100) / 100 : '–'} (${load.status})${load.acwr != null && load.acwr > 1.3 ? ' ⚠' : ''}`,
    rampRate != null ? `ramp ${rampRate > 0 ? '+' : ''}${rampRate}%` : null,
    load.consecutiveDays > 0 ? `${load.consecutiveDays} consecutive days` : null,
  ].filter(Boolean).join(', ')

  const recentActivities = activities.slice(0, 5).map(a =>
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
    `  - ${m.label}: ${m.recovery}% recovered → ${m.recommendation}`
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
- Readiness: ${readiness.score ?? '–'}/100 (${readiness.label})
- HRV: ${hrvLine}
- RHR: ${rhrLine}
- Illness/strain: ${illness ? illness.reason : 'none'}
${readiness.explanation ? `- Note: ${readiness.explanation}` : ''}

### Sleep (last 7 nights)
- 30-day avg: ${baselines.sleep != null ? fmtMin(baselines.sleep) : '–'}
${sleepSummary || '  No data'}

### Training load (last 7d)
${loadLine}

### Recent sessions (last 5)
${recentActivities || '  No activities'}

### Muscle recovery (strength)
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
  const recs           = buildRecs(healthRows, activities, hevy, calendarEvents, foodForRecs)
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
