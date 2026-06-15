'use client'

import { Suspense, useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { PremiumScreen } from '@/components/PremiumScreen'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import { computeRecoveryScore, computePhysiologyReadiness } from '@/lib/readiness'
import {
  computeSleepScore,
  SleepSection,
  RecoverySection,
  HeartSection,
  WeightSection,
  ActivitySection,
  type GezondheidsRow,
} from './sections'

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
  // Server and first client render must match. SWR hydrates from localStorage on the
  // client, so isLoading state would differ from SSR. Gate tab content on mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const TABS = ALL_TABS.filter(t => !t.href || !hiddenPages.includes(t.href))

  function switchTab(key: string) {
    setActiveTab(key)
    window.scrollTo({ top: 0, behavior: 'instant' })
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

  const recoveryScore = computeRecoveryScore(rows)
  const readiness = computePhysiologyReadiness(rows)
  const recoveryScorepct = recoveryScore.score
  const recoveryColor = recoveryScorepct !== null
    ? (recoveryScorepct >= 85 ? '#4ade80' : recoveryScorepct >= 70 ? '#2dd4bf' : recoveryScorepct >= 50 ? '#fb923c' : '#f87171')
    : 'rgba(255,255,255,0.3)'


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

      {/* Tab content — only after mount so SSR and first client render match */}
      <div style={{ opacity: mounted && !isLoading ? 1 : 0, transition: 'opacity 0.15s ease' }}>
      {mounted && activeTab === 'sleep'    && <SleepSection />}
      {mounted && activeTab === 'recovery' && <RecoverySection />}
      {mounted && activeTab === 'heart'    && <HeartSection />}
      {mounted && activeTab === 'weight'   && <WeightSection rows={rows} />}
      {mounted && activeTab === 'activity' && <ActivitySection rows={rows} />}

      {mounted && activeTab === 'overview' && <>

        {/* Recovery Score hero */}
        <Card>
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Recovery Score</span>
            {recoveryScorepct !== null ? (<>
              <div className="flex items-end justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-[56px] font-bold text-white leading-none">{recoveryScorepct}</span>
                  <span className="text-[24px] font-semibold text-white/50">%</span>
                </div>
                <div className="flex items-center gap-1.5 pb-1">
                  <div className="w-[8px] h-[8px] rounded-full" style={{ background: recoveryColor }} />
                  <span className="text-[17px] font-semibold" style={{ color: recoveryColor }}>{recoveryScore.label}</span>
                </div>
              </div>
              <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${recoveryScorepct}%`, background: recoveryColor }} />
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: recoveryColor }} />
                <span className="text-[14px] font-semibold" style={{ color: recoveryColor }}>
                  {recoveryScorepct >= 85 ? 'Fully recovered' : recoveryScorepct >= 70 ? 'Good recovery' : recoveryScorepct >= 50 ? 'Moderate recovery' : 'Low recovery'}
                </span>
              </div>
            </>) : (
              <p className="text-[15px] text-white/40">Connect Fitbit to see recovery data.</p>
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

      </>}

      </div>
    </PremiumScreen>
  )
}
