'use client'

import { Suspense, useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSearchParams, useRouter } from 'next/navigation'
import { Activity, RefreshCw, ChevronRight } from 'lucide-react'
import { PremiumScreen } from '@/components/PremiumScreen'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import { computePhysiologyReadiness } from '@/lib/readiness'
import {
  computeSleepScore,
  SleepSection,
  RecoverySection,
  HeartSection,
  WeightSection,
  ActivitySection,
  type GezondheidsRow,
} from './sections'

type SyncMessage = { type: 'ok' | 'err'; text: string }

async function fetchHealth() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const { data } = await supabase
    .from('gezondheid')
    .select('datum,stappen,gewicht,hartslag_rust,hrv_rmssd,slaap_minuten,slaap_score,slaap_diep,slaap_licht,slaap_rem,wakker_minuten,wakker_count,spo2,ademhalingsfrequentie,slaap_start_min,slaap_einde_min')
    .eq('user_id', user.id).order('datum', { ascending: false }).limit(30)
  return (data ?? []) as GezondheidsRow[]
}

async function refreshHealthCache() {
  const rows = await fetchHealth()
  mutate('health-gezondheid', rows, false)
  mutate('today', (current: any) => current ? { ...current, latestGezondheid: rows[0] ?? null } : current, false)
  return rows
}

async function fetchHiddenPages(): Promise<string[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase.from('user_settings').select('hidden_pages').eq('user_id', user.id).single()
  return Array.isArray(data?.hidden_pages) ? data.hidden_pages : []
}

const ALL_TABS = [
  { label: 'Overview', key: 'overview', href: null               },
  { label: 'Sleep',    key: 'sleep',    href: '/health/sleep'    },
  { label: 'Recovery', key: 'recovery', href: '/health/recovery' },
  { label: 'Heart',    key: 'heart',    href: '/health/heart'    },
  { label: 'Weight',   key: 'weight',   href: '/health/weight'   },
  { label: 'Activity', key: 'activity', href: '/health/activity' },
]

function FitbitSyncHandler() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (searchParams.get('fitbit') !== 'connected') return

    let cancelled = false

    async function syncConnectedFitbit() {
      try {
        await fetch('/api/fitbit/sync', { method: 'POST' })
        if (!cancelled) await refreshHealthCache()
      } finally {
        if (!cancelled) router.replace('/health')
      }
    }

    syncConnectedFitbit()
    return () => { cancelled = true }
  }, [searchParams, router])

  return null
}

export default function HealthPage() {
  const { data: rows = [], isLoading } = useSWR('health-gezondheid', fetchHealth, {
    revalidateOnFocus: false, dedupingInterval: 60_000,
  })
  const { data: hiddenPages = [] } = useSWR('user-settings-pages', fetchHiddenPages, {
    revalidateOnFocus: false, dedupingInterval: 300_000,
  })
  const [activeTab, setActiveTab] = useState('overview')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<SyncMessage | null>(null)

  const TABS = ALL_TABS.filter(t => !t.href || !hiddenPages.includes(t.href))

  function switchTab(key: string) {
    setActiveTab(key)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  // Calendar events from the shared 'today' SWR cache (populated by DataProvider)
  const { data: todayCache } = useSWR<any>('today', null)
  const calEvents = todayCache?.calendarEvents ?? []

  const _todayStr = new Date().toISOString().slice(0, 10)
  const _tomStr   = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const _nowStr   = new Date().toISOString()

  const SPORT_KW_H = ['push','pull','legs','squat','gym','kracht','strength','bench','deadlift','hyrox',
    'run','loop','ride','fietsen','zwemmen','swim','cycling','hardlopen','wielren','interval','tempo','training','workout','sport']
  const GYM_KW_H   = ['push','pull','legs','squat','gym','kracht','strength','bench','deadlift','hyrox']

  function _isSport(e: any) { return SPORT_KW_H.some(k => (e.title ?? '').toLowerCase().includes(k)) }

  const todayEvt = calEvents
    .filter((e: any) => { const dt = e.start_datetime || e.start_date; return dt.slice(0,10) === _todayStr && dt >= _nowStr && _isSport(e) })
    .sort((a: any, b: any) => (a.start_datetime || a.start_date).localeCompare(b.start_datetime || b.start_date))[0] ?? null

  const tomEvt = calEvents
    .filter((e: any) => { const dt = e.start_datetime || e.start_date; return dt.slice(0,10) === _tomStr && _isSport(e) })
    .sort((a: any, b: any) => (a.start_datetime || a.start_date).localeCompare(b.start_datetime || b.start_date))[0] ?? null

  function _evtEmoji(title: string) {
    const t = title.toLowerCase()
    if (['push','bench','chest'].some(k => t.includes(k)))       return '💪'
    if (['pull','row','chin','lat'].some(k => t.includes(k)))    return '💪'
    if (['legs','squat','deadlift'].some(k => t.includes(k)))    return '🏋️'
    if (['run','loop','hardloop'].some(k => t.includes(k)))      return '🏃'
    if (['ride','fiet','cycl','wielren'].some(k => t.includes(k))) return '🚴'
    if (['swim','zwem'].some(k => t.includes(k)))                return '🏊'
    return '🏋️'
  }

  function _evtHref(e: any) {
    const t = (e.title ?? '').toLowerCase()
    if (GYM_KW_H.some(k => t.includes(k))) return '/training/strength'
    const dt = e.start_datetime || e.start_date
    return `/training/session?title=${encodeURIComponent(e.title ?? '')}&time=${encodeURIComponent(dt)}`
  }

  function _evtTime(e: any) {
    if (!e.start_datetime) return ''
    const d = new Date(e.start_datetime)
    return ` · ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
  }

  const latest          = rows[0]
  const latestWithSleep = rows.find(r => r.slaap_minuten != null) ?? null
  const latestWithHR    = rows.find(r => r.hartslag_rust  != null) ?? null
  const latestWithHRV   = rows.find(r => r.hrv_rmssd      != null) ?? null

  const steps      = latest?.stappen ?? null
  const weight     = latest?.gewicht ? Number(latest.gewicht).toFixed(1) : null
  const restingHR  = latestWithHR?.hartslag_rust ?? null
  const hrv        = latestWithHRV?.hrv_rmssd ?? null
  const sleepScore = latestWithSleep ? computeSleepScore(latestWithSleep) : null

  const weightRows   = rows.filter(r => r.gewicht != null)
  const latestWeight = weightRows[0] ? Number(weightRows[0].gewicht) : null
  const oldWeight    = weightRows[6] ? Number(weightRows[6].gewicht) : null
  const weightChange = latestWeight && oldWeight ? latestWeight - oldWeight : null
  const weightDetail = weightChange !== null
    ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg vs 7 dagen`
    : '–'

  const stepRows  = rows.filter(r => r.stappen != null).slice(0, 7)
  const avgSteps  = stepRows.length
    ? Math.round(stepRows.reduce((s, r) => s + Number(r.stappen), 0) / stepRows.length)
    : null
  const stepsDetail = avgSteps ? `avg ${avgSteps.toLocaleString('nl-NL')} / day` : '–'

  const physiologyReadiness = computePhysiologyReadiness(rows)
  const readinessPct = physiologyReadiness.score
  const readinessColor = readinessPct !== null
    ? (readinessPct >= 70 ? '#4ade80' : readinessPct >= 45 ? '#fb923c' : '#f87171')
    : 'rgba(255,255,255,0.3)'

  const recommendationData = (() => {
    const noData = sleepScore === null && hrv === null && restingHR === null
    if (noData)
      return { emoji: '📱', title: 'Connect Fitbit', bullets: ['Personalised recommendations available after connecting'], cta: null }

    const pct = readinessPct

    // Critical: multiple signals very low
    if (pct !== null && pct < 35)
      return { emoji: '😴', title: 'Rest Day', bullets: [
        'Multiple recovery markers are low',
        'Light walk only — avoid structured training',
        tomEvt ? `${tomEvt.title} planned tomorrow — recover well` : 'Prioritise sleep and nutrition today',
      ], cta: { label: 'Check sleep →', tab: 'sleep' as const, href: null } }

    // Suppressed HRV or elevated HR + poor sleep
    if ((hrv !== null && hrv < 25) || (restingHR !== null && restingHR > 72 && sleepScore !== null && sleepScore < 50))
      return { emoji: '🛌', title: 'Recover Today', bullets: [
        hrv !== null && hrv < 25
          ? `HRV at ${Math.round(Number(hrv))} ms — below recovery threshold`
          : `Resting HR elevated at ${restingHR} bpm`,
        'Avoid high intensity today',
        tomEvt ? `${tomEvt.title} planned tomorrow — save energy` : 'Prioritise sleep tonight',
      ], cta: { label: 'See HRV trend →', tab: 'heart' as const, href: null } }

    // Calendar event today — most actionable
    if (todayEvt) {
      const evtTitle = todayEvt.title as string
      const evtEmoji = _evtEmoji(evtTitle)
      const evtTime  = _evtTime(todayEvt)
      const evtHref  = _evtHref(todayEvt)
      if (pct !== null && pct >= 70)
        return { emoji: evtEmoji, title: evtTitle, bullets: [
          `Recovery ${pct}% — physiology supports full effort${evtTime}`,
          'Good day to push intensity',
          'Warm up well and stay hydrated',
        ], cta: { label: `Open session →`, tab: null, href: evtHref } }
      if (pct !== null && pct >= 45)
        return { emoji: evtEmoji, title: evtTitle, bullets: [
          `Recovery ${pct}% — train but avoid maximum effort${evtTime}`,
          'Moderate intensity is appropriate',
          'Cut short if your body signals fatigue',
        ], cta: { label: `Open session →`, tab: null, href: evtHref } }
      return { emoji: evtEmoji, title: evtTitle, bullets: [
        `Recovery only ${pct ?? '?'}% — consider a lighter session${evtTime}`,
        'Modify to easy effort or postpone',
        'Rest may serve you better today',
      ], cta: { label: `View session →`, tab: null, href: evtHref } }
    }

    // No event — readiness-based generic recommendation
    if (pct !== null && pct >= 75)
      return { emoji: '🏋️', title: 'Quality Training', bullets: [
        `Recovery ${pct}% — body is ready for a hard session`,
        sleepScore !== null ? `Sleep score ${sleepScore}% supports high output` : 'Physiological signals look strong',
        tomEvt ? `${tomEvt.title} planned tomorrow — consider intensity` : 'Good day for a demanding workout',
      ], cta: { label: 'Plan your session →', tab: null, href: '/training' } }

    if (pct !== null && pct >= 55)
      return { emoji: '🚴', title: 'Zone 2 Ride', bullets: [
        `Recovery ${pct}% — moderate training day`,
        'Zone 2 builds aerobic base with low fatigue cost',
        tomEvt ? `${tomEvt.title} planned tomorrow — save energy` : 'Good nutrition will support full recovery',
      ], cta: { label: 'View training →', tab: null, href: '/training' } }

    return { emoji: '🚶', title: 'Light Movement', bullets: [
      pct !== null ? `Recovery ${pct}% — keep intensity low` : 'Recovery markers suggest an easy day',
      sleepScore !== null && sleepScore < 55 ? `Sleep score ${sleepScore}% — target 8 hours tonight` : 'Prioritise rest and nutrition',
      tomEvt ? `${tomEvt.title} planned tomorrow — recover well today` : 'Light walk or stretching recommended',
    ], cta: { label: 'Check sleep →', tab: 'sleep' as const, href: null } }
  })()

  const recCta = recommendationData.cta

  async function handleSync() {
    setSyncing(true)
    try {
      setSyncMessage(null)
      const res = await fetch('/api/fitbit/sync', { method: 'POST' })
      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.ok) {
        const apiError = Array.isArray(data?.errors) && data.errors.length ? String(data.errors[0]) : null
        const text = data?.error === 'not connected'
          ? 'Fitbit is nog niet gekoppeld.'
          : apiError
            ? `Fitbit sync fout: ${apiError}`
          : 'Fitbit sync mislukt.'
        setSyncMessage({ type: 'err', text })
        return
      }

      await refreshHealthCache()

      const errorCount = Array.isArray(data.errors) ? data.errors.length : 0
      setSyncMessage({
        type: errorCount ? 'err' : 'ok',
        text: errorCount
          ? `Sync voltooid met ${errorCount} fout${errorCount === 1 ? '' : 'en'}: ${String(data.errors[0])}`
          : `Fitbit bijgewerkt: ${data.healthSynced ?? 0} health rows, ${data.stepsSynced ?? 0} step days.`,
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <PremiumScreen title="Health" subtitle="Recovery foundation" contentGap={18}>

      <Suspense>
        <FitbitSyncHandler />
      </Suspense>

      {/* Category strip — buttons swap content in place, no navigation */}
      <div className="flex gap-2.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(({ label, key }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className="whitespace-nowrap px-4 py-2.5 rounded-full text-[15px] font-semibold shrink-0"
            style={activeTab === key
              ? { background: 'white', color: 'black' }
              : { background: 'rgba(255,255,255,0.08)', color: 'white' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ opacity: isLoading ? 0 : 1, transition: 'opacity 0.15s ease' }}>
      {activeTab === 'sleep'    && <SleepSection />}
      {activeTab === 'recovery' && <RecoverySection />}
      {activeTab === 'heart'    && <HeartSection />}
      {activeTab === 'weight'   && <WeightSection rows={rows} />}
      {activeTab === 'activity' && <ActivitySection rows={rows} />}

      {activeTab === 'overview' && <>

        {/* Recovery Score hero */}
        <Card>
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Recovery Score</span>
            {readinessPct !== null ? (<>
              <div className="flex items-end justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-[56px] font-bold text-white leading-none">{readinessPct}</span>
                  <span className="text-[24px] font-semibold text-white/50">%</span>
                </div>
                <div className="flex items-center gap-1.5 pb-1">
                  <div className="w-[8px] h-[8px] rounded-full" style={{ background: readinessColor }} />
                  <span className="text-[17px] font-semibold" style={{ color: readinessColor }}>{physiologyReadiness.label}</span>
                </div>
              </div>
              <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${readinessPct}%`, background: readinessColor }} />
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: readinessColor }} />
                <span className="text-[14px] font-semibold" style={{ color: readinessColor }}>
                  {readinessPct >= 70 ? 'Ready for training' : readinessPct >= 45 ? 'Light training only' : 'Rest recommended'}
                </span>
              </div>
            </>) : (
              <p className="text-[15px] text-white/40">Connect Fitbit to see readiness data.</p>
            )}
          </div>
        </Card>

        {/* Signal rows — Sleep, HRV, HR first; Weight + Steps last */}
        <div style={{ background: 'rgba(255,255,255,0.075)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, overflow: 'hidden' }}>
          {([
            { label: 'Sleep',      value: sleepScore ? `${sleepScore}%`                           : '–',       tab: 'sleep',    show: true           },
            { label: 'HRV',        value: hrv        ? `${Math.round(Number(hrv))} ms`            : '–',       tab: 'heart',    show: true           },
            { label: 'Resting HR', value: restingHR  ? `${restingHR} bpm`                         : '–',       tab: 'heart',    show: true           },
            { label: 'Weight',     value: latestWeight ? `${latestWeight.toFixed(1)} kg`           : 'No data', tab: 'weight',   show: latestWeight !== null },
            { label: 'Steps',      value: steps      ? `${Number(steps).toLocaleString('nl-NL')}` : '–',       tab: 'activity', show: true           },
          ] as const).filter(r => r.show).map(({ label, value, tab }, i, arr) => (
            <button
              key={label}
              onClick={() => switchTab(tab)}
              className="flex items-center justify-between px-4 py-3.5 w-full text-left"
              style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
            >
              <span className="text-[15px] text-white/70">{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-white">{value}</span>
                <ChevronRight size={14} className="text-white/30" />
              </div>
            </button>
          ))}
        </div>

        {/* Today's Recommendation — hero card */}
        <div className="p-5 rounded-[24px] border border-white/[0.12]" style={{ background: 'rgba(45,212,191,0.07)', marginTop: 10 }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em]">Today's Recommendation</p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-teal-400 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <span className="text-[42px] leading-none">{recommendationData.emoji}</span>
            <span className="text-[22px] font-bold text-white leading-tight">{recommendationData.title}</span>
          </div>
          <div className="flex flex-col gap-1.5 pt-3 border-t border-white/[0.08]">
            {recommendationData.bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-teal-400/60 text-[12px] mt-[2px] shrink-0">•</span>
                <span className="text-[13px] text-white/65">{b}</span>
              </div>
            ))}
          </div>
          {syncMessage && (
            <p className={`text-[13px] font-medium mt-3 ${syncMessage.type === 'ok' ? 'text-teal-400' : 'text-orange-300'}`}>
              {syncMessage.text}
            </p>
          )}
          {recCta && (
            <div className="mt-4">
              {recCta.href ? (
                <a href={recCta.href} className="flex items-center justify-center py-2 rounded-[14px] text-[13px] font-semibold text-black" style={{ background: 'rgb(45,212,191)' }}>
                  {recCta.label}
                </a>
              ) : (
                <button onClick={() => switchTab(recCta.tab!)} className="flex items-center justify-center w-full py-2 rounded-[14px] text-[13px] font-semibold text-black" style={{ background: 'rgb(45,212,191)' }}>
                  {recCta.label}
                </button>
              )}
            </div>
          )}
        </div>
      </>}

      </div>
    </PremiumScreen>
  )
}
