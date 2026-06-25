'use client'

import { Suspense, useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSearchParams, useRouter } from 'next/navigation'
import { Activity, RefreshCw, ChevronRight } from 'lucide-react'
import { PremiumScreen } from '@/components/PremiumScreen'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import { computePhysiologyReadiness, computeIllnessFlag, computeHRVBaseline } from '@/lib/readiness'
import { computePersonalProfile } from '@/lib/personal-learning'
import { openDevices } from '@/lib/services'
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
  { label: 'Weight & Body', key: 'weight', href: '/health/weight' },
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
    revalidateOnFocus: true, revalidateOnMount: true, dedupingInterval: 5_000,
  })
  const { data: hiddenPages = [] } = useSWR('user-settings-pages', fetchHiddenPages, {
    revalidateOnFocus: false, dedupingInterval: 300_000,
  })
  const [activeTab, setActiveTab] = useState('overview')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<SyncMessage | null>(null)

  const TABS = ALL_TABS.filter(t => !t.href || !hiddenPages.includes(t.href))

  // Auto-sync Fitbit/Google Health on mount so the latest data is pulled in
  // without tapping "Sync". Throttled to once every 15 min to avoid hammering
  // the API on every navigation.
  useEffect(() => {
    const THROTTLE_MS = 15 * 60 * 1000
    let last = 0
    try { last = Number(localStorage.getItem('fitbit-last-sync') ?? 0) } catch { /* ignore */ }
    if (Date.now() - last < THROTTLE_MS) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/fitbit/sync', { method: 'POST' })
        if (!res.ok) return
        try { localStorage.setItem('fitbit-last-sync', String(Date.now())) } catch { /* ignore */ }
        if (!cancelled) await refreshHealthCache()
      } catch { /* offline or not connected — ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

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
  const sleepScore = latestWithSleep ? (latestWithSleep.slaap_score ?? computeSleepScore(latestWithSleep)) : null

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

  const illnessFlag  = computeIllnessFlag(rows)
  const hrvBaseline  = computeHRVBaseline(rows)
  const _sleepMin    = latestWithSleep?.slaap_minuten ?? null
  const _sleepDeep   = latestWithSleep?.slaap_diep    ?? null
  const _wakeMin     = (latestWithSleep as any)?.slaap_einde_min ?? null
  const _hrThreshold = (() => {
    const vals = rows.filter(r => r.hartslag_rust != null).slice(0, 14).map(r => r.hartslag_rust as number)
    return vals.length >= 5 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) + 5 : 65
  })()

  const todayFocus = (() => {
    if (illnessFlag) return {
      emoji: '🛑',
      title: 'Rest completely today',
      sub: `${illnessFlag.reason} — prioritise sleep, fluids and no alcohol tonight`,
    }
    if (readinessPct === null) return {
      emoji: '📊',
      title: 'Connect Google Health',
      sub: 'Sync health data to see personalised daily focus advice',
    }
    if (_sleepMin !== null && _sleepMin < 420) {
      const hh = Math.floor(_sleepMin / 60), mm = _sleepMin % 60
      const bed = _wakeMin !== null
        ? (() => { const b = ((_wakeMin - 8 * 60) + 1440) % 1440; return `${String(Math.floor(b / 60)).padStart(2, '0')}:${String(b % 60).padStart(2, '0')}` })()
        : '22:30'
      return { emoji: '🛏️', title: `In bed by ${bed} tonight`, sub: `You got ${hh}h ${mm}m last night — 30 min more sleep meaningfully improves HRV and recovery.` }
    }
    if (_sleepDeep !== null && _sleepMin !== null && _sleepDeep / _sleepMin < 0.15)
      return { emoji: '🌙', title: 'No alcohol or screens after 21:00', sub: `Deep sleep was ${Math.round(_sleepDeep / _sleepMin * 100)}% last night (target 20%). Alcohol and blue light suppress slow-wave sleep.` }
    if (sleepScore !== null && sleepScore < 60)
      return { emoji: '🌡️', title: 'Cool bedroom tonight (16–18 °C)', sub: `Sleep quality score was ${sleepScore} — body temperature needs to drop to reach deep sleep.` }
    if (hrvBaseline.deviationPct !== null && hrvBaseline.deviationPct < -15)
      return { emoji: '🌬️', title: '5 min box breathing', sub: `HRV is ${Math.abs(hrvBaseline.deviationPct)}% below your baseline. Inhale 4s → hold 4s → exhale 4s → hold 4s. Repeat 5×.` }
    if (restingHR !== null && restingHR > _hrThreshold)
      return { emoji: '💧', title: 'Drink 2–3L water today', sub: `Resting heart rate is ${restingHR} bpm — ${restingHR - _hrThreshold} bpm above your normal. Dehydration is a common cause of elevated RHR.` }
    if (readinessPct >= 75)
      return { emoji: '☀️', title: '10 min sunlight this morning', sub: 'Recovery is strong. Morning light anchors your circadian rhythm and naturally improves deep sleep tonight.' }
    return { emoji: '🥗', title: '30–40g protein with dinner', sub: 'Recovery nutrition: protein in the evening supports muscle repair during sleep. Greek yoghurt, eggs or chicken work well.' }
  })()
  const readinessColor = readinessPct !== null
    ? (readinessPct >= 70 ? '#4ade80' : readinessPct >= 45 ? '#fb923c' : '#f87171')
    : 'rgba(255,255,255,0.3)'

  // Personal thresholds learned from your own baseline (fall back to population cutoffs)
  const personalProfile = computePersonalProfile(rows as any, [], [], [])
  const hrvBadCutoff = personalProfile.hrvBadThreshold ?? 25
  const rhrBadCutoff = personalProfile.rhrBadThreshold ?? 72

  const recommendationData = (() => {
    const noData = sleepScore === null && hrv === null && restingHR === null
    if (noData)
      return { emoji: '📱', title: 'Connect Google Health', bullets: ['Personalised recommendations available after connecting'], cta: null }

    const pct      = readinessPct
    const sleepMin = latestWithSleep?.slaap_minuten ?? null
    const sleepDeep = latestWithSleep?.slaap_diep ?? null
    const wakeMin  = latestWithSleep?.slaap_einde_min ?? null

    // Very low readiness → complete rest
    if (pct !== null && pct < 35)
      return { emoji: '😴', title: 'Rest day', bullets: [
        'No training today — focus on sleep, fluids and nutrition',
        `Recovery ${pct}% — multiple health markers are low`,
        'Early bedtime tonight: aim for 8+ hours',
      ], cta: { label: 'Check sleep →', tab: 'sleep' as const, href: null } }

    // Suppressed HRV or elevated RHR → breathwork & lifestyle
    if ((hrv !== null && hrv < hrvBadCutoff) || (restingHR !== null && restingHR > rhrBadCutoff))
      return { emoji: '🌬️', title: 'Recovery focus today', bullets: [
        '5 min box breathing: inhale 4s · hold 4s · exhale 4s · repeat',
        hrv !== null && hrv < hrvBadCutoff
          ? `HRV ${Math.round(Number(hrv))} ms — below your usual range${personalProfile.hrvBaseline ? ` (baseline ~${personalProfile.hrvBaseline} ms)` : ''}`
          : `Resting HR ${restingHR} bpm — slightly elevated`,
        'No alcohol tonight — it suppresses HRV and deep sleep',
      ], cta: { label: 'See HRV trend →', tab: 'heart' as const, href: null } }

    // Sleep short → suggest earlier bedtime
    if (sleepMin !== null && sleepMin < 420) {
      const hh = Math.floor(sleepMin / 60), mm = sleepMin % 60
      const bedSuggestion = wakeMin !== null
        ? (() => { const b = ((wakeMin - 8 * 60) + 1440) % 1440; return `${String(Math.floor(b / 60)).padStart(2,'0')}:${String(b % 60).padStart(2,'0')}` })()
        : '22:30'
      return { emoji: '🛏️', title: `In bed by ${bedSuggestion} tonight`, bullets: [
        `You got ${hh}h ${mm}m last night — 30 min more sleep improves HRV and recovery`,
        'No screens from 30 min before bedtime',
        tomEvt ? `${tomEvt.title} planned tomorrow — good sleep helps performance` : 'Consistent bedtime anchors your circadian rhythm',
      ], cta: { label: 'Check sleep →', tab: 'sleep' as const, href: null } }
    }

    // Deep sleep low → habits that protect slow-wave sleep
    if (sleepDeep !== null && sleepMin !== null && sleepDeep / sleepMin < 0.15)
      return { emoji: '🌙', title: 'Protect deep sleep tonight', bullets: [
        'No alcohol or screens after 21:00',
        `Deep sleep was ${Math.round(sleepDeep / sleepMin * 100)}% last night — target is 20%+`,
        'Keep your bedroom below 18 °C for better slow-wave sleep',
      ], cta: { label: 'Check sleep →', tab: 'sleep' as const, href: null } }

    // Calendar event today — keep link but health-focused bullets
    if (todayEvt) {
      const evtTitle = todayEvt.title as string
      const evtEmoji = _evtEmoji(evtTitle)
      const evtTime  = _evtTime(todayEvt)
      const evtHref  = _evtHref(todayEvt)
      if (pct !== null && pct >= 70)
        return { emoji: evtEmoji, title: evtTitle, bullets: [
          `Recovery ${pct}% — body is in good shape${evtTime}`,
          'Stay well hydrated before, during and after',
          'Prioritise sleep and protein tonight to lock in recovery',
        ], cta: { label: 'Open session →', tab: null, href: evtHref } }
      return { emoji: evtEmoji, title: evtTitle, bullets: [
        `Recovery ${pct ?? '?'}% — listen to your body today${evtTime}`,
        'Hydrate well and eat a proper meal beforehand',
        'If you feel off, cut short — recovery comes first',
      ], cta: { label: 'Open session →', tab: null, href: evtHref } }
    }

    // Good readiness, no event → proactive wellness habit
    if (pct !== null && pct >= 70)
      return { emoji: '☀️', title: '10 min sunlight this morning', bullets: [
        'Recovery is strong — great day to build healthy habits',
        'Morning light sets your circadian rhythm and improves tonight\'s sleep',
        'Aim for 30–40g protein with dinner to support overnight recovery',
      ], cta: { label: 'See recovery →', tab: 'recovery' as const, href: null } }

    // Moderate readiness → hydration & nutrition
    if (pct !== null && pct >= 50)
      return { emoji: '💧', title: 'Hydration & nutrition today', bullets: [
        'Drink 2–3L water throughout the day',
        `Recovery ${pct}% — support it with whole foods and rest`,
        tomEvt ? `${tomEvt.title} tomorrow — fuel and sleep well tonight` : 'Aim for an earlier bedtime tonight',
      ], cta: { label: 'Check sleep →', tab: 'sleep' as const, href: null } }

    return { emoji: '😴', title: 'Rest & recover', bullets: [
      'Keep today easy — focus on sleep and nutrition',
      pct !== null ? `Recovery ${pct}% — body needs rest today` : 'Recovery markers suggest an easy day',
      tomEvt ? `${tomEvt.title} planned tomorrow — recover well` : 'Early bedtime: aim for 8+ hours tonight',
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
          ? 'Google Health is not yet connected.'
          : apiError
            ? `Google Health sync error: ${apiError}`
          : 'Google Health sync failed.'
        setSyncMessage({ type: 'err', text })
        return
      }

      await refreshHealthCache()

      const errorCount = Array.isArray(data.errors) ? data.errors.length : 0
      setSyncMessage({
        type: errorCount ? 'err' : 'ok',
        text: errorCount
          ? `Sync completed with ${errorCount} error${errorCount === 1 ? '' : 's'}: ${String(data.errors[0])}`
          : `Google Health updated: ${data.healthSynced ?? 0} health rows, ${data.stepsSynced ?? 0} step days.`,
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

      {activeTab === 'overview' && <div className="flex flex-col gap-[18px]">

        {/* Today's Focus */}
        <div className="p-5 rounded-[22px] border border-white/[0.1]" style={{ background: 'rgba(45,212,191,0.07)' }}>
          <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em] mb-3">Today's Focus</p>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[32px] leading-none">{todayFocus.emoji}</span>
            <p className="text-[19px] font-bold text-white leading-tight">{todayFocus.title}</p>
          </div>
          {todayFocus.sub && <p className="text-[13px] text-white/55 leading-relaxed">{todayFocus.sub}</p>}
          {readinessPct === null && (
            <button onClick={openDevices}
              className="mt-3 flex items-center gap-1 text-[14px] font-semibold text-teal-400 active:opacity-60">
              Connect now <ChevronRight size={15} />
            </button>
          )}
        </div>

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
                  {readinessPct >= 70 ? 'Strong recovery' : readinessPct >= 45 ? 'Moderate recovery' : 'Rest recommended'}
                </span>
              </div>
            </>) : (
              <button onClick={openDevices} className="flex items-center gap-1 text-[15px] font-medium text-teal-400 active:opacity-60">
                Connect Google Health to see readiness data <ChevronRight size={15} />
              </button>
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
      </div>}

      </div>
    </PremiumScreen>
  )
}
