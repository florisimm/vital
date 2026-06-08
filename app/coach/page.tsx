'use client'

import { useState } from 'react'
import { ArrowUp } from 'lucide-react'
import useSWR from 'swr'
import { PremiumScreen } from '@/components/PremiumScreen'
import { CoachRecommendation } from '@/components/ui'
import { computePhysiologyReadiness, computeIllnessFlag, type HealthRow } from '@/lib/readiness'
import type { Activity, HevyWorkout } from '@/app/training/sections'

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

  // 1. Illness / strain — highest priority
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
      recs.push({
        title: nextEvent ? `Ready for ${nextEvent.title}` : 'Full intensity available',
        text: `Readiness is ${readiness.score} (${readiness.label}). HRV and sleep are above baseline — this is a quality training window.`,
      })
    } else if (readiness.score >= 65) {
      recs.push({
        title: 'Moderate intensity only',
        text: `Readiness is ${readiness.score}. Zone 2 or technique work fits best today. Avoid threshold or max-effort intervals.`,
      })
    } else if (readiness.score >= 50) {
      recs.push({
        title: 'Light session or rest',
        text: `Readiness is ${readiness.score} — below baseline. A rest day will accelerate tomorrow's score more than a hard session.`,
      })
    } else {
      recs.push({
        title: 'Rest recommended',
        text: `Readiness is ${readiness.score} (${readiness.label}). Multiple recovery markers are low. Quality sleep tonight produces better returns than any workout today.`,
      })
    }
  }

  // 2. ACWR — training load risk
  const acute7kj = activities
    .filter(a => a.start_date >= d7)
    .reduce((s, a) => s + (a.kilojoules ?? (a.moving_time ?? 0) / 60), 0)
  const chronic28kj = activities
    .filter(a => a.start_date >= d28)
    .reduce((s, a) => s + (a.kilojoules ?? (a.moving_time ?? 0) / 60), 0)
  const chronic28Avg = chronic28kj / 4
  const acwr = chronic28Avg > 5 ? Math.round((acute7kj / chronic28Avg) * 10) / 10 : null

  if (acwr !== null) {
    if (acwr > 1.4) {
      recs.push({
        title: 'Reduce volume this week',
        text: `Acute:chronic workload ratio is ${acwr} — 7-day load is ${Math.round(acwr * 100)}% of your 28-day average. Above 1.3 raises injury risk. Cut volume 20–30% before your next hard block.`,
      })
    } else if (acwr < 0.7 && activities.length > 3) {
      recs.push({
        title: 'Volume is below baseline',
        text: `ACWR ${acwr} — this week is lighter than your chronic average. Safe to push volume today if readiness supports it.`,
      })
    }
  }

  // 3. Protein check
  const logs = Array.isArray(foodData) ? foodData : (foodData?.food_log ?? foodData?.foodLog ?? [])
  const totalProtein  = logs.reduce((s: number, f: any) => s + Number(f.protein ?? 0), 0)
  const targetProtein = Number(foodData?.targets?.protein ?? 0)

  if (targetProtein > 0 && totalProtein < targetProtein - 30) {
    recs.push({
      title: `${Math.round(targetProtein - totalProtein)}g protein remaining`,
      text: `${Math.round(totalProtein)}g of ${Math.round(targetProtein)}g logged. Protein drives muscle repair — prioritise it in your next meal.`,
    })
  } else if (targetProtein > 0 && totalProtein >= targetProtein) {
    recs.push({
      title: 'Protein goal reached',
      text: `${Math.round(totalProtein)}g logged today. Recovery from training continues 24–48h after a session — stay consistent tomorrow.`,
    })
  }

  // 4. Sleep trend
  const sleepRows = healthRows.filter(r => r.slaap_minuten != null)
  if (sleepRows.length >= 3) {
    const recent7   = sleepRows.slice(0, 7)
    const avg7Sleep = recent7.reduce((s, r) => s + (r.slaap_minuten ?? 0), 0) / recent7.length
    const lastSleep = sleepRows[0]?.slaap_minuten ?? null

    if (avg7Sleep < 400) {
      const h = Math.floor(avg7Sleep / 60), m = Math.round(avg7Sleep % 60)
      recs.push({
        title: 'Sleep debt accumulating',
        text: `7-day average is ${h}h ${m}m — below the 7h minimum for recovery adaptation. Aim for 22:30 lights-out. Caffeine cutoff: 13:00.`,
      })
    } else if (lastSleep !== null && lastSleep < 360) {
      recs.push({
        title: 'Short night — protect tonight',
        text: `Last night: ${Math.floor(lastSleep / 60)}h ${lastSleep % 60}m. Screens off by 22:00, target 7–8 hours tonight.`,
      })
    }
  }

  // 5. Upcoming workout prep
  const tomorrowEvent = calendarEvents.find(e => (e.start_datetime || e.start_date || '').slice(0, 10) === tomorrowStr)
  if (tomorrowEvent && recs.length < 5) {
    recs.push({
      title: `Prepare for ${tomorrowEvent.title}`,
      text: `${tomorrowEvent.title} is scheduled tomorrow. Sleep before 23:00, hit your protein target, and stay hydrated today.`,
    })
  }

  return recs.slice(0, 5)
}

export default function CoachPage() {
  const [message, setMessage] = useState('')
  const { data: healthRows = [] } = useSWR<HealthRow[]>(
    'health-gezondheid', null, { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )
  const { data: training } = useSWR<{ activities: Activity[]; hevy: HevyWorkout[]; calendarEvents: any[] }>(
    'training', null, { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )
  const { data: foodData } = useSWR<any>('food-log', null, { revalidateOnFocus: false, dedupingInterval: 60_000 })

  const activities     = training?.activities ?? []
  const calendarEvents = training?.calendarEvents ?? []
  const recs           = buildRecs(healthRows, activities, calendarEvents, foodData)
  const hasData        = healthRows.length > 0 || activities.length > 0

  return (
    <PremiumScreen title="Coach" subtitle="Objective recommendations" contentGap={18}>
      {hasData ? (
        recs.length > 0 ? (
          recs.map((rec, i) => (
            <CoachRecommendation
              key={i}
              rank={String(i + 1).padStart(2, '0')}
              title={rec.title}
              text={rec.text}
            />
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

      <div className="flex items-center gap-3 pt-2.5">
        <input
          type="text"
          placeholder="Ask for analysis"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1 h-[52px] px-4 rounded-[18px] text-white placeholder:text-white/30 outline-none text-[17px]"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        />
        <button
          onClick={() => setMessage('')}
          aria-label="Send message"
          className="w-[52px] h-[52px] rounded-full bg-white flex items-center justify-center shrink-0"
        >
          <ArrowUp size={20} className="text-black" strokeWidth={2.5} />
        </button>
      </div>
    </PremiumScreen>
  )
}
