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

  const recommendation = (() => {
    if (!sleepScore && !hrv && !restingHR)
      return 'Connect Fitbit to see personalised health recommendations.'
    if (restingHR !== null && restingHR > 70 && sleepScore !== null && sleepScore < 55)
      return 'Multiple recovery markers are low. Rest or gentle movement only today.'
    if (hrv !== null && hrv < 25)
      return 'HRV is suppressed. Avoid high intensity and prioritise sleep tonight.'
    if ((sleepScore === null || sleepScore >= 75) && (restingHR === null || restingHR <= 58))
      return 'Recovery looks strong. A quality training session is well-supported today.'
    if (sleepScore !== null && sleepScore >= 65)
      return 'Recovery is moderate. Zone 2 training and good nutrition will bring you to full readiness.'
    if (sleepScore !== null && sleepScore < 55)
      return 'Sleep quality is below par. Keep intensity low and target 8 hours tonight.'
    return 'Physiological signals support moderate training today.'
  })()

  const physiologyReadiness = computePhysiologyReadiness(rows)
  const readinessPct = physiologyReadiness.score
  const readinessColor = readinessPct !== null
    ? (readinessPct >= 70 ? '#4ade80' : readinessPct >= 45 ? '#fb923c' : '#f87171')
    : 'rgba(255,255,255,0.3)'

  const recCta = (() => {
    if (!sleepScore && !hrv && !restingHR) return null
    if (restingHR !== null && restingHR > 70 && sleepScore !== null && sleepScore < 55)
      return { label: 'Check your sleep →', tab: 'sleep' as const, href: null }
    if (hrv !== null && hrv < 25)
      return { label: 'See HRV trend →', tab: 'heart' as const, href: null }
    return { label: 'View training →', tab: null, href: '/training' }
  })()

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

        {/* Today's Status — readiness hero */}
        <Card>
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Today's Status</span>
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
            </>) : (
              <p className="text-[15px] text-white/40">Connect Fitbit to see readiness data.</p>
            )}
          </div>
        </Card>

        {/* Signal rows — each row taps into its sub-tab */}
        <div style={{ background: 'rgba(255,255,255,0.075)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, overflow: 'hidden' }}>
          {([
            { label: 'Sleep',       value: sleepScore ? `${sleepScore}%`                              : '–', tab: 'sleep'    },
            { label: 'HRV',         value: hrv        ? `${Math.round(Number(hrv))} ms`               : '–', tab: 'heart'    },
            { label: 'Resting HR',  value: restingHR  ? `${restingHR} bpm`                            : '–', tab: 'heart'    },
            { label: 'Weight',      value: weight     ? `${weight} kg`                                 : '–', tab: 'weight'   },
            { label: 'Steps',       value: steps      ? `${Number(steps).toLocaleString('nl-NL')}`    : '–', tab: 'activity' },
          ] as const).map(({ label, value, tab }, i) => (
            <button
              key={label}
              onClick={() => switchTab(tab)}
              className="flex items-center justify-between px-4 py-3.5 w-full text-left"
              style={{ borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
            >
              <span className="text-[15px] text-white/70">{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-white">{value}</span>
                <ChevronRight size={14} className="text-white/30" />
              </div>
            </button>
          ))}
        </div>

        {/* Recommendation + contextual CTA */}
        <Card>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">
                Recommendation
              </span>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-teal-400 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing…' : 'Sync'}
              </button>
            </div>
            <p className="text-[22px] font-bold text-white leading-snug">
              {recommendation}
            </p>
            {syncMessage && (
              <p className={`text-[13px] font-medium ${syncMessage.type === 'ok' ? 'text-teal-400' : 'text-orange-300'}`}>
                {syncMessage.text}
              </p>
            )}
            {recCta && (
              <div className="flex justify-end pt-1">
                {recCta.href ? (
                  <a href={recCta.href} className="px-3 py-1.5 rounded-full text-[13px] font-semibold text-black" style={{ background: 'rgb(45,212,191)' }}>
                    {recCta.label}
                  </a>
                ) : (
                  <button onClick={() => switchTab(recCta.tab!)} className="px-3 py-1.5 rounded-full text-[13px] font-semibold text-black" style={{ background: 'rgb(45,212,191)' }}>
                    {recCta.label}
                  </button>
                )}
              </div>
            )}
          </div>
        </Card>
      </>}

      </div>
    </PremiumScreen>
  )
}
