'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ChevronLeft, Dumbbell, Loader2, Trash2 } from 'lucide-react'

const MAX_TURNS = 10
import useSWR from 'swr'
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
type ChatMessage = { role: 'user' | 'assistant'; content: string; direct?: boolean }

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtMin(min: number) {
  const total = Math.round(min)
  const h = Math.floor(total / 60), m = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function computeSimpleBaselines(rows: HealthRow[]) {
  const hist = rows.slice(1, 31)
  const mean = (a: number[]) => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10 : null
  return {
    rhr:   mean(hist.filter(r => r.hartslag_rust != null).map(r => r.hartslag_rust as number)),
    sleep: mean(hist.filter(r => r.slaap_minuten != null).map(r => r.slaap_minuten as number)),
  }
}

// ─── buildRecs ────────────────────────────────────────────────────────────────

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
    if (acwr > 1.4) recs.push({ title: 'Ease off this week', text: `You've trained noticeably more this week than your recent average — a jump this big raises injury risk. Cut back about 20–30% before your next hard session.` })
    else if (acwr < 0.7 && activities.length > 3) recs.push({ title: 'Room to do more', text: `This week is lighter than usual for you. If you're feeling fresh, it's a good day to add a bit more.` })
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

// ─── tryDirectAnswer ─────────────────────────────────────────────────────────

function tryDirectAnswer(
  msg: string, healthRows: HealthRow[], activities: Activity[], hevy: HevyWorkout[], foodData: any,
): string | null {
  const m      = msg.toLowerCase()
  const today  = new Date().toISOString().slice(0, 10)
  const todayH = healthRows.find(r => r.datum === today)
  const sleepRows = healthRows.filter(r => r.slaap_minuten != null)
  const logs   = Array.isArray(foodData) ? foodData : (foodData?.food_log ?? foodData?.foodLog ?? [])
  const tgProt = Number(foodData?.targets?.protein ?? 0)
  const tgKcal = Number(foodData?.targets?.kcal ?? 0)
  const totProt = Math.round(logs.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0))
  const totKcal = Math.round(logs.reduce((s: number, f: any) => s + Number(f.kcal ?? 0), 0))

  if (/protein|eiwit/.test(m) && /target|goal|doel|how much|hoeveel|today|vandaag|daily/.test(m)) {
    if (!tgProt) return 'No protein target set yet — add one in your profile.'
    const rem = Math.round(tgProt - totProt)
    return rem > 0 ? `Protein target: ${Math.round(tgProt)}g/day. Logged today: ${totProt}g — ${rem}g remaining.` : `Protein goal reached: ${totProt}g logged (target: ${Math.round(tgProt)}g). ✓`
  }
  if (/calori|kcal/.test(m) && /target|goal|doel|how much|hoeveel|today|vandaag|daily/.test(m)) {
    if (!tgKcal) return `Logged today: ${totKcal} kcal. No calorie target set.`
    const rem = tgKcal - totKcal
    return rem > 0 ? `Calorie target: ${tgKcal} kcal. Logged today: ${totKcal} kcal — ${rem} kcal remaining.` : `Calorie target reached: ${totKcal} kcal logged (target: ${tgKcal} kcal). ✓`
  }
  if (/how.*(did i sleep|was my sleep|heb ik geslapen)|sleep (last night|score|gisteravond)|slaap (gisteravond|score)/.test(m)) {
    const last = sleepRows[0]
    if (!last) return 'No sleep data yet — sync your Fitbit.'
    const dur  = last.slaap_minuten ? fmtMin(last.slaap_minuten) : '–'
    const score = last.slaap_score != null ? `, score ${last.slaap_score}/100` : ''
    const deep  = last.slaap_diep != null && last.slaap_minuten ? `, deep ${Math.round(last.slaap_diep / last.slaap_minuten * 100)}%` : ''
    return `Last night (${last.datum}): ${dur}${score}${deep}.`
  }
  if (/what.*(is my|is de).*(readiness|recovery|herstel)|readiness score|recovery score|herstelwaarde/.test(m)) {
    const r = computePhysiologyReadiness(healthRows)
    if (r.score == null) return 'No readiness data yet — connect Fitbit.'
    return `Readiness today: ${r.score}/100 (${r.label}).${r.explanation ? ` ${r.explanation}` : ''}`
  }
  if (/what.*(is my|is de).*\bhrv\b|\bhrv\b.*(today|vandaag|now|nu)/.test(m)) {
    if (!todayH?.hrv_rmssd) return 'No HRV data for today yet.'
    const base = computeHRVBaseline(healthRows)
    const dev  = base.deviationPct != null ? ` (${base.deviationPct > 0 ? '+' : ''}${base.deviationPct}% vs baseline)` : ''
    return `HRV today: ${todayH.hrv_rmssd} ms${base.baseline != null ? ` / baseline ${base.baseline} ms` : ''}${dev}.`
  }
  if (/resting.heart|rusthartslag|resting hr/.test(m) && /what|how|hoeveel|wat/.test(m)) {
    if (!todayH?.hartslag_rust) return 'No resting heart rate for today yet.'
    const base = computeSimpleBaselines(healthRows)
    const dev  = base.rhr != null ? ` (30-day baseline: ${base.rhr} bpm)` : ''
    return `Resting HR today: ${todayH.hartslag_rust} bpm${dev}.`
  }
  if (/\b(steps|stappen)\b/.test(m) && /today|vandaag|how many|hoeveel/.test(m)) {
    if (!todayH?.stappen) return 'No step data for today yet.'
    return `Steps today: ${todayH.stappen.toLocaleString()}.`
  }
  if (/what.*(did i (train|do|workout)|sessions?)|recent.*(sessions?|trainings?)|laatste.*training|welke.*training.*week/.test(m)) {
    const t7 = new Date(Date.now() - 7 * 86400000).toISOString()
    const acts7 = activities.filter(a => a.start_date >= t7)
    const hevy7 = hevy.filter(h => h.start_time >= t7)
    if (!acts7.length && !hevy7.length) return 'No sessions in the last 7 days.'
    const lines = [
      ...acts7.map(a => `${a.start_date?.slice(0, 10)} — ${a.sport_type} "${a.name}" ${Math.round((a.moving_time ?? 0) / 60)} min${a.distance ? `, ${(a.distance / 1000).toFixed(1)} km` : ''}`),
      ...hevy7.map(h => `${h.start_time?.slice(0, 10)} — Strength: ${h.title} ${fmtMin((h.duration ?? 0) / 60)}`),
    ].sort().reverse()
    return `Sessions last 7 days:\n${lines.join('\n')}`
  }
  return null
}

// ─── buildSections + selectContext ───────────────────────────────────────────

type Sections = {
  profile: string; readiness: string; sleep: string; trainingLoad: string
  activities: string; muscle: string; nutrition: string; calendar: string
}

function buildSections(
  goal: string, trainingGoalKey: string, healthRows: HealthRow[],
  activities: Activity[], hevy: HevyWorkout[], calendarEvents: any[], foodData: any,
): Sections {
  const today     = new Date().toISOString().slice(0, 10)
  const readiness = computePhysiologyReadiness(healthRows)
  const illness   = computeIllnessFlag(healthRows)
  const baselines = computeSimpleBaselines(healthRows)
  const load      = computeTrainingLoadScore(activities, hevy)
  const rampRate  = computeRampRate(activities, hevy)
  const muscle    = computeMuscleGroupAdvice(hevy)
  const hrvBase   = computeHRVBaseline(healthRows)

  const todayHealth   = healthRows.find(r => r.datum === today)
  const sleepRows     = healthRows.filter(r => r.slaap_minuten != null).slice(0, 7)
  const logs          = Array.isArray(foodData) ? foodData : (foodData?.food_log ?? foodData?.foodLog ?? [])
  const targetProtein = Number(foodData?.targets?.protein ?? 0)
  const targetKcal    = Number(foodData?.targets?.kcal ?? 0)
  const totalProtein  = logs.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const totalKcal     = logs.reduce((s: number, f: any) => s + Number(f.kcal ?? 0), 0)

  const hrvToday = todayHealth?.hrv_rmssd
  const hrvDev   = hrvBase.deviationPct
  const hrvLine  = hrvToday != null ? `${hrvToday} ms${hrvBase.baseline != null ? ` / baseline ${hrvBase.baseline} ms` : ''}${hrvDev != null ? ` (${hrvDev > 0 ? '+' : ''}${hrvDev}%)` : ''}` : '–'

  const rhrToday = todayHealth?.hartslag_rust
  const rhrDev   = rhrToday != null && baselines.rhr != null ? Math.round((rhrToday - baselines.rhr) / baselines.rhr * 100) : null
  const rhrLine  = rhrToday != null ? `${rhrToday} bpm${baselines.rhr != null ? ` / baseline ${baselines.rhr} bpm` : ''}${rhrDev != null ? ` (${rhrDev > 0 ? '+' : ''}${rhrDev}%)` : ''}` : '–'

  const t7      = new Date(Date.now() - 7 * 86400000).toISOString()
  const acts7   = activities.filter(a => a.start_date >= t7)
  const hevy7   = hevy.filter(h => h.start_time >= t7)
  const sportMap: Record<string, number> = {}
  for (const a of acts7) { const k = (a.sport_type ?? 'other').toLowerCase(); sportMap[k] = (sportMap[k] ?? 0) + 1 }
  if (hevy7.length) sportMap['strength'] = (sportMap['strength'] ?? 0) + hevy7.length
  const totalMin7 = acts7.reduce((s, a) => s + (a.moving_time ?? 0) / 60, 0) + hevy7.reduce((s, h) => s + (h.duration ?? 0) / 60, 0)
  const loadLine  = [
    Object.entries(sportMap).length ? Object.entries(sportMap).map(([k, v]) => `${v} ${k}`).join(', ') : 'no sessions',
    totalMin7 > 0 ? fmtMin(totalMin7) : null,
    `ACWR ${load.acwr != null ? Math.round(load.acwr * 100) / 100 : '–'} (${load.status})${load.acwr != null && load.acwr > 1.3 ? ' ⚠' : ''}`,
    rampRate != null ? `ramp ${rampRate > 0 ? '+' : ''}${rampRate}%` : null,
    load.consecutiveDays > 0 ? `${load.consecutiveDays} consecutive days` : null,
  ].filter(Boolean).join(', ')

  const GOAL_PRIORITY: Record<string, string> = {
    lose_weight:  '1. Recovery · 2. Adherence · 3. Fat loss · 4. Performance',
    build_muscle: '1. Recovery · 2. Progressive overload · 3. Protein intake · 4. Cardio',
    get_fitter:   '1. Recovery · 2. Aerobic load · 3. Consistency · 4. Performance',
    maintain:     '1. Consistency · 2. Recovery · 3. Balance across modalities',
    performance:  '1. Performance · 2. Recovery · 3. Specificity · 4. Volume management',
  }

  return {
    profile: [
      `### Profile — ${today}`,
      goal ? `Primary goal: ${goal}` : null,
      GOAL_PRIORITY[trainingGoalKey] ? `Priority: ${GOAL_PRIORITY[trainingGoalKey]}` : null,
    ].filter(Boolean).join('\n'),

    readiness: [
      '### Recovery & readiness',
      `- Readiness: ${readiness.score ?? '–'}/100 (${readiness.label})`,
      `- HRV: ${hrvLine}`,
      `- RHR: ${rhrLine}`,
      `- Illness/strain: ${illness ? illness.reason : 'none'}`,
      readiness.explanation ? `- Note: ${readiness.explanation}` : null,
    ].filter(Boolean).join('\n'),

    sleep: [
      '### Sleep (last 7 nights)',
      `- 30-day avg: ${baselines.sleep != null ? fmtMin(baselines.sleep) : '–'}`,
      ...sleepRows.map(r => `- ${r.datum}: ${r.slaap_minuten ? fmtMin(r.slaap_minuten) : '–'}${r.slaap_score != null ? `, score ${r.slaap_score}` : ''}${r.hrv_rmssd != null ? `, HRV ${r.hrv_rmssd} ms` : ''}`),
    ].join('\n'),

    trainingLoad: `### Training load (last 7d)\n${loadLine}`,

    activities: [
      '### Recent sessions (last 5)',
      ...activities.slice(0, 5).map(a => `- ${a.start_date?.slice(0, 10)} ${a.sport_type ?? ''} "${a.name ?? ''}" — ${Math.round((a.moving_time ?? 0) / 60)} min${a.distance ? `, ${(a.distance / 1000).toFixed(1)} km` : ''}`),
    ].join('\n'),

    muscle: [
      '### Muscle recovery',
      ...muscle.map(m => `- ${m.label}: ${m.recovery}% → ${m.recommendation}`),
    ].join('\n'),

    nutrition: [
      '### Nutrition today',
      `- Calories: ${Math.round(totalKcal)} kcal${targetKcal ? ` / ${targetKcal} kcal` : ''}`,
      `- Protein: ${Math.round(totalProtein)}g${targetProtein ? ` / ${Math.round(targetProtein)}g` : ''}`,
    ].join('\n'),

    calendar: [
      '### Upcoming events',
      ...calendarEvents.filter(e => (e.start_datetime || e.start_date || '') >= today).slice(0, 5).map(e => `- ${(e.start_datetime || e.start_date || '').slice(0, 10)} ${e.title}`),
    ].join('\n'),
  }
}

function selectContext(question: string, s: Sections): string {
  const q          = question.toLowerCase()
  const isSleep    = /slaap|sleep|moe|tired|nacht|rust/.test(q)
  const isFood     = /eten|food|eiwit|protein|kcal|macro|lunch|ontbijt|diner/.test(q)
  const isTraining = /training|workout|loop|fiets|rit|run|interval|schema|sessie|sport/.test(q)
  const isRecovery = /herstel|recovery|hrv|hartslag|rhr|readiness/.test(q)
  const isComplex  = !isSleep && !isFood && !isTraining && !isRecovery

  return [
    s.profile,
    s.readiness,
    (isSleep || isRecovery || isComplex) ? s.sleep : null,
    (isRecovery || isComplex) ? s.muscle : null,
    (isFood || isComplex) ? s.nutrition : null,
    (isTraining || isComplex) ? s.trainingLoad : null,
    (isTraining || isComplex) ? s.activities : null,
    (isTraining || isComplex) ? s.calendar : null,
  ].filter(Boolean).join('\n\n')
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoachPage() {
  const router = useRouter()
  const [message, setMessage]           = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [sessionContext, setSessionContext] = useState<string | null>(null)
  const [streaming, setStreaming]       = useState(false)
  const [streamText, setStreamText]     = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const userTurns = chatMessages.filter(m => m.role === 'user').length
  const atLimit   = userTurns >= MAX_TURNS

  function clearChat() {
    setChatMessages([])
    setSessionContext(null)
  }

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamText])

  async function handleSend() {
    if (!message.trim() || streaming || atLimit) return
    const q = message.trim()
    setMessage('')

    // Direct answers skip the API entirely
    const direct = tryDirectAnswer(q, healthRows, activities, hevy, foodForRecs)
    if (direct) {
      setChatMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: direct, direct: true }])
      return
    }

    // Lock context on first turn; all subsequent turns reuse the same text so the
    // Anthropic cache_control hit fires on turns 2+ (identical content = cache hit).
    const sections = buildSections(goal, training?.trainingGoal ?? '', healthRows, activities, hevy, calendarEvents, foodForRecs)
    const ctx = sessionContext ?? selectContext(q, sections)
    if (!sessionContext) setSessionContext(ctx)

    const updated = [...chatMessages, { role: 'user' as const, content: q }]
    setChatMessages(updated)
    setStreaming(true)
    setStreamText('')

    try {
      // ctx is identical every turn → Anthropic caches it after turn 1 (~10× cheaper input)
      const apiMessages = updated.map((msg, i) => {
        if (i === 0 && msg.role === 'user') {
          return {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: `## User context\n\n${ctx}`, cache_control: { type: 'ephemeral' as const } },
              { type: 'text' as const, text: msg.content },
            ],
          }
        }
        return { role: msg.role, content: msg.content }
      })

      const resp = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })
      if (!resp.ok) throw new Error(await resp.text())

      const reader  = resp.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setStreamText(full)
      }
      setChatMessages(prev => [...prev, { role: 'assistant', content: full }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Er is iets misgegaan — probeer het opnieuw.' }])
    } finally {
      setStreaming(false)
      setStreamText('')
    }
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>

      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 shrink-0"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          paddingBottom: '12px',
          background: 'rgba(18,18,22,0.97)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <button onClick={() => router.back()} className="text-white/70 active:text-white mr-1">
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, rgb(45,212,191) 0%, rgb(20,160,140) 100%)' }}
        >
          <Dumbbell size={18} className="text-white" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-semibold text-white leading-tight">Coach</div>
          <div className="text-[12px] text-teal-400 leading-tight">Online</div>
        </div>
        {chatMessages.length > 0 && (
          <button onClick={clearChat} className="text-white/35 active:text-white/70">
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">

        {/* Recommendations as coach bubbles */}
        {recs.map((rec, i) => (
          <div key={i} className="flex justify-start">
            <div
              className="max-w-[82%] rounded-[18px] px-4 py-3 text-[15px] leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="font-semibold text-white mb-0.5">{rec.title}</div>
              <div className="text-white/70">{rec.text}</div>
            </div>
          </div>
        ))}

        {/* Chat messages */}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[82%] rounded-[18px] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap"
              style={msg.role === 'user'
                ? { background: 'rgb(45,212,191)', color: 'rgb(5,6,8)' }
                : { background: msg.direct ? 'rgba(45,212,191,0.10)' : 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.07)' }
              }
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming bubble */}
        {streaming && (
          <div className="flex justify-start">
            <div
              className="max-w-[82%] rounded-[18px] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap"
              style={{ background: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {streamText || <Loader2 size={16} className="animate-spin text-white/40" />}
            </div>
          </div>
        )}

        {/* Turn limit */}
        {atLimit && (
          <div className="rounded-[14px] px-4 py-3 text-center text-[14px] text-white/50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Limiet bereikt —{' '}
            <button onClick={clearChat} className="text-teal-400 underline-offset-2 underline">wis het gesprek</button>
            {' '}om door te gaan.
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Bottom input bar */}
      <div
        className="shrink-0 flex items-center gap-2 px-3"
        style={{
          paddingTop: '10px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
          background: 'rgba(18,18,22,0.97)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <input
          type="text"
          placeholder="Stel een vraag…"
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          className="flex-1 h-[44px] px-4 rounded-full text-white placeholder:text-white/30 outline-none text-[16px]"
          style={{ background: 'rgba(255,255,255,0.08)', opacity: atLimit ? 0.4 : 1 }}
          disabled={atLimit}
        />
        <button
          onClick={handleSend}
          aria-label="Verstuur"
          className="w-[44px] h-[44px] rounded-full flex items-center justify-center shrink-0 disabled:opacity-30"
          style={{ background: 'rgb(45,212,191)' }}
          disabled={!message.trim() || streaming || atLimit}
        >
          {streaming
            ? <Loader2 size={18} className="text-black animate-spin" />
            : <ArrowUp size={18} className="text-black" strokeWidth={2.5} />
          }
        </button>
      </div>

    </div>
  )
}
