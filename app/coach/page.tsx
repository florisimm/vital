'use client'

import { useState } from 'react'
import { ArrowUp, Copy, Check, X } from 'lucide-react'
import useSWR from 'swr'
import { PremiumScreen } from '@/components/PremiumScreen'
import { CoachRecommendation } from '@/components/ui'
import { computePhysiologyReadiness, computeIllnessFlag, type HealthRow } from '@/lib/readiness'
import type { Activity, HevyWorkout } from '@/app/training/sections'
import { healthFetcher } from '@/app/health/fetcher'
import { trainingFetcher } from '@/app/training/fetcher'
import { fetchFoodData } from '@/app/food/fetchers'

type Rec = { title: string; text: string }

function buildRecs(
  healthRows: HealthRow[],
  activities: Activity[],
  calendarEvents: any[],
  foodData: any,
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
    recs.push({
      title: 'Strain detected — rest today',
      text: `Multiple signals are outside baseline (${illness.reason}). Training through this prolongs recovery. Rest or a slow walk only.`,
    })
  } else if (readiness.score !== null) {
    const todayEvent    = calendarEvents.find(e => (e.start_datetime || e.start_date || '').slice(0, 10) === todayStr)
    const tomorrowEvent = calendarEvents.find(e => (e.start_datetime || e.start_date || '').slice(0, 10) === tomorrowStr)
    const nextEvent     = todayEvent ?? tomorrowEvent

    if (readiness.score >= 80) {
      recs.push({ title: nextEvent ? `Ready for ${nextEvent.title}` : 'Full intensity available', text: `Readiness is ${readiness.score} (${readiness.label}). HRV and sleep are above baseline — this is a quality training window.` })
    } else if (readiness.score >= 65) {
      recs.push({ title: 'Moderate intensity only', text: `Readiness is ${readiness.score}. Zone 2 or technique work fits best today. Avoid threshold or max-effort intervals.` })
    } else if (readiness.score >= 50) {
      recs.push({ title: 'Light session or rest', text: `Readiness is ${readiness.score} — below baseline. A rest day will accelerate tomorrow's score more than a hard session.` })
    } else {
      recs.push({ title: 'Rest recommended', text: `Readiness is ${readiness.score} (${readiness.label}). Multiple recovery markers are low. Quality sleep tonight produces better returns than any workout today.` })
    }
  }

  const acute7kj    = activities.filter(a => a.start_date >= d7).reduce((s, a) => s + (a.kilojoules ?? (a.moving_time ?? 0) / 60), 0)
  const chronic28kj = activities.filter(a => a.start_date >= d28).reduce((s, a) => s + (a.kilojoules ?? (a.moving_time ?? 0) / 60), 0)
  const chronic28Avg = chronic28kj / 4
  const acwr = chronic28Avg > 5 ? Math.round((acute7kj / chronic28Avg) * 10) / 10 : null

  if (acwr !== null) {
    if (acwr > 1.4) recs.push({ title: 'Reduce volume this week', text: `Acute:chronic workload ratio is ${acwr} — 7-day load is ${Math.round(acwr * 100)}% of your 28-day average. Above 1.3 raises injury risk.` })
    else if (acwr < 0.7 && activities.length > 3) recs.push({ title: 'Volume is below baseline', text: `ACWR ${acwr} — this week is lighter than your chronic average. Safe to push volume today if readiness supports it.` })
  }

  const logs = Array.isArray(foodData) ? foodData : (foodData?.food_log ?? foodData?.foodLog ?? [])
  const totalProtein  = logs.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(foodData?.targets?.protein ?? 0)

  if (targetProtein > 0 && totalProtein < targetProtein - 30) {
    recs.push({ title: `${Math.round(targetProtein - totalProtein)}g protein remaining`, text: `${Math.round(totalProtein)}g of ${Math.round(targetProtein)}g logged. Protein drives muscle repair — prioritise it in your next meal.` })
  } else if (targetProtein > 0 && totalProtein >= targetProtein) {
    recs.push({ title: 'Protein goal reached', text: `${Math.round(totalProtein)}g logged today. Recovery from training continues 24–48h after a session — stay consistent tomorrow.` })
  }

  const sleepRows = healthRows.filter(r => r.slaap_minuten != null)
  if (sleepRows.length >= 3) {
    const avg7Sleep = sleepRows.slice(0, 7).reduce((s, r) => s + (r.slaap_minuten ?? 0), 0) / Math.min(sleepRows.length, 7)
    const lastSleep = sleepRows[0]?.slaap_minuten ?? null
    if (avg7Sleep < 400) {
      const h = Math.floor(avg7Sleep / 60), m = Math.round(avg7Sleep % 60)
      recs.push({ title: 'Sleep debt accumulating', text: `7-day average is ${h}h ${m}m — below 7h minimum. Aim for 22:30 lights-out. Caffeine cutoff: 13:00.` })
    } else if (lastSleep !== null && lastSleep < 360) {
      recs.push({ title: 'Short night — protect tonight', text: `Last night: ${Math.floor(lastSleep / 60)}h ${lastSleep % 60}m. Screens off by 22:00, target 7–8h tonight.` })
    }
  }

  const tomorrowEvt = calendarEvents.find(e => (e.start_datetime || e.start_date || '').slice(0, 10) === tomorrowStr)
  if (tomorrowEvt && recs.length < 5) {
    recs.push({ title: `Prepare for ${tomorrowEvt.title}`, text: `${tomorrowEvt.title} is scheduled tomorrow. Sleep before 23:00, hit your protein target, and stay hydrated today.` })
  }

  return recs.slice(0, 5)
}

function buildPrompt(
  userMessage: string,
  healthRows: HealthRow[],
  activities: Activity[],
  calendarEvents: any[],
  foodData: any,
): string {
  const today = new Date().toISOString().slice(0, 10)
  const readiness = computePhysiologyReadiness(healthRows)
  const illness   = computeIllnessFlag(healthRows)

  const todayHealth = healthRows.find(r => r.datum === today)
  const sleepRows   = healthRows.filter(r => r.slaap_minuten != null).slice(0, 7)
  const logs        = Array.isArray(foodData) ? foodData : (foodData?.food_log ?? foodData?.foodLog ?? [])
  const targetProtein = Number(foodData?.targets?.protein ?? 0)
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
    `  - ${r.datum}: ${r.slaap_minuten ? `${Math.floor(r.slaap_minuten / 60)}h ${r.slaap_minuten % 60}m` : '–'}${r.slaap_score != null ? `, score ${r.slaap_score}` : ''}${r.hrv_rmssd != null ? `, HRV ${r.hrv_rmssd} ms` : ''}`
  ).join('\n')

  const system = `You are a data-driven fitness and health coach. You analyse the user's biometric data, training load, sleep, and nutrition and give concise, evidence-based advice. Be direct and specific — no generic tips. Always refer to the actual numbers in the data.`

  const context = `## User context — ${today}

### Recovery & readiness
- Readiness score: ${readiness.score ?? '–'} / 100 (${readiness.label})
- HRV today: ${todayHealth?.hrv_rmssd != null ? `${todayHealth.hrv_rmssd} ms` : '–'}
- Resting HR today: ${todayHealth?.hartslag_rust != null ? `${todayHealth.hartslag_rust} bpm` : '–'}
- Illness / strain flag: ${illness ? illness.reason : 'none'}
${readiness.explanation ? `- Readiness explanation: ${readiness.explanation}` : ''}

### Sleep (last 7 nights)
${sleepSummary || '  No data'}

### Training (last 10 sessions)
${recentActivities || '  No activities'}

### Nutrition today
- Calories logged: ${Math.round(totalKcal)} kcal${foodData?.targets?.kcal ? ` / ${foodData.targets.kcal} kcal target` : ''}
- Protein: ${Math.round(totalProtein)}g${targetProtein ? ` / ${Math.round(targetProtein)}g target` : ''}

### Upcoming calendar events
${upcomingEvents || '  None'}

---
## User message
${userMessage}`

  return `SYSTEM:\n${system}\n\nUSER:\n${context}`
}

export default function CoachPage() {
  const [message, setMessage]   = useState('')
  const [prompt, setPrompt]     = useState<string | null>(null)
  const [copied, setCopied]     = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const { data: healthRows = [] } = useSWR<HealthRow[]>('health-gezondheid', healthFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const { data: training } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const { data: foodData } = useSWR(`food-log-${today}`, () => fetchFoodData(today), { revalidateOnFocus: false, dedupingInterval: 60_000 })

  const activities     = training?.activities ?? []
  const calendarEvents = training?.calendarEvents ?? []
  const foodForRecs    = foodData ? { food_log: foodData.foodLog, targets: foodData.targets } : null
  const recs           = buildRecs(healthRows, activities, calendarEvents, foodForRecs)
  const hasData        = healthRows.length > 0 || activities.length > 0

  function handleSend() {
    if (!message.trim()) return
    const full = buildPrompt(message, healthRows, activities, calendarEvents, foodForRecs)
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
      {hasData ? (
        recs.length > 0 ? (
          recs.map((rec, i) => (
            <CoachRecommendation key={i} rank={String(i + 1).padStart(2, '0')} title={rec.title} text={rec.text} />
          ))
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
