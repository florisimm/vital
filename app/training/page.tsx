'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { PremiumScreen } from '@/components/PremiumScreen'
import {
  OverviewSection, RunningSection, CyclingSection,
  SwimmingSection, StrengthSection, HistorySection,
  CoachLearnedCard,
} from './sections'
import { PerformanceSection } from './PerformanceSection'
import { SportPlanCard } from './SportPlanCard'
import { trainingFetcher } from './fetcher'
import { createClient } from '@/lib/supabase'
import type { ZoneTargets } from '@/lib/training-plan'

const ALL_TABS = [
  { label: 'Overview',  key: 'overview',    href: null,                     freqKey: null    },
  { label: 'Running',   key: 'running',     href: '/training/running',      freqKey: 'running'  },
  { label: 'Cycling',   key: 'cycling',     href: '/training/cycling',      freqKey: 'cycling'  },
  { label: 'Swimming',  key: 'swimming',    href: '/training/swimming',     freqKey: 'swimming' },
  { label: 'Strength',  key: 'strength',    href: '/training/strength',     freqKey: 'gym'      },
  { label: 'Log',       key: 'history',     href: '/training/history',      freqKey: null    },
  { label: 'Metrics',   key: 'performance', href: '/training/performance',  freqKey: null    },
]

export default function TrainingPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: true, revalidateOnMount: true, dedupingInterval: 5_000 })
  const [activeTab, setActiveTab] = useState('overview')
  // Server and first client render must match. SWR hydrates from localStorage on the
  // client, so data-driven content (emoji, labels) would differ from SSR. Gate it on mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab) setActiveTab(tab)
  }, [])

  const freqs: Record<string, number> = (data as any)?.trainingFrequencies ?? {}
  const TABS = ALL_TABS.filter(t => !t.freqKey || (freqs[t.freqKey] ?? 0) > 0)

  function switchTab(key: string) {
    setActiveTab(key)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  async function handleSaveTargets(sport: 'running' | 'cycling' | 'swimming', newTargets: ZoneTargets) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('user_settings')
      .update({ training_zone_targets: { ...(data as any)?.zoneTargets, [sport]: newTargets } })
      .eq('user_id', user.id)
    mutate('training')
  }

  useEffect(() => {
    async function backgroundSync() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
        const base = process.env.NEXT_PUBLIC_SUPABASE_URL
        await Promise.allSettled([
          fetch(`${base}/functions/v1/google-calendar-sync`, { method: 'POST', headers }),
          fetch(`${base}/functions/v1/strava-sync`, { method: 'POST', headers }),
        ])
        await fetch(`${base}/functions/v1/strava-reconcile`, { method: 'POST', headers })
      } catch { /* ignore */ }
      mutate('training')
    }
    backgroundSync()
  }, [])

  const activities = data?.activities ?? []
  const hevy = data?.hevy ?? []
  const calendarEvents = data?.calendarEvents ?? []
  const trainingFrequencies = data?.trainingFrequencies ?? {}
  const biasBySport = data?.biasBySport ?? {}
  const pastCalendarEvents = data?.pastCalendarEvents ?? []
  const sportPriority: string[] = data?.sportPriority ?? []
  const trainingIntensity: string = (data as any)?.trainingIntensity ?? 'moderate'
  const goalPriority: string[] = (data as any)?.goalPriority ?? []
  const injuries: Record<string, boolean> = (data as any)?.injuries ?? {}
  const maxHeartRate: number | null = (data as any)?.maxHeartRate ?? null

  // Derive which sport today's plan recommends, to gate advice in sport tabs
  const todaySport = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    for (const e of calendarEvents) {
      if ((e.start_datetime || e.start_date || '').slice(0, 10) !== today) continue
      const t = (e.title ?? '').toLowerCase()
      if (['ride', 'fiet', 'cycl', 'bike', 'wielren'].some(k => t.includes(k))) return 'cycling'
      if (['run', 'loop', 'hardloop', 'interval', 'tempo', 'duurloop'].some(k => t.includes(k))) return 'running'
      if (['swim', 'zwem'].some(k => t.includes(k))) return 'swimming'
      if (['gym', 'strength', 'push', 'pull', 'legs', 'kracht', 'bench', 'deadlift', 'hyrox'].some(k => t.includes(k))) return 'strength'
    }
    // No calendar event — check which sport still has remaining targets this week
    const mon = new Date(); mon.setDate(mon.getDate() - (mon.getDay() || 7) + 1)
    const ws = mon.toISOString().slice(0, 10)
    const wRuns  = activities.filter((a: any) => a.sport_type?.toLowerCase().includes('run')  && a.start_date >= ws).length
    const wRides = activities.filter((a: any) => { const t = (a.sport_type ?? '').toLowerCase(); return (t.includes('ride') || t.includes('cycl')) && a.start_date >= ws }).length
    const wSwims = activities.filter((a: any) => a.sport_type?.toLowerCase().includes('swim') && a.start_date >= ws).length
    const needs = [
      { sport: 'running',  need: (trainingFrequencies.running  ?? 0) - wRuns  },
      { sport: 'cycling',  need: (trainingFrequencies.cycling  ?? 0) - wRides },
      { sport: 'swimming', need: (trainingFrequencies.swimming ?? 0) - wSwims },
    ].filter(s => s.need > 0).sort((a, b) => b.need - a.need)
    return needs[0]?.sport ?? null
  }, [calendarEvents, activities, trainingFrequencies])

  return (
    <PremiumScreen title="Training" subtitle="Training Overview" contentGap={18}>
      {/* Category strip — buttons swap content, no navigation */}
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
      <div style={{ opacity: mounted && data ? 1 : 0, transition: 'opacity 0.15s ease' }}>
        {mounted && activeTab === 'overview'    && <div className="flex flex-col gap-[18px]">
          <CoachLearnedCard learned={(data as any)?.coachLearned} />
          <OverviewSection activities={activities} hevy={hevy} calendarEvents={calendarEvents} pastCalendarEvents={pastCalendarEvents} trainingFrequencies={trainingFrequencies} biasBySport={biasBySport} sportPriority={sportPriority} goalPriority={goalPriority} trainingIntensity={trainingIntensity} maxHeartRate={maxHeartRate} onSwitchTab={switchTab} />
        </div>}
        {mounted && activeTab === 'running' && <>
          <RunningSection activities={activities} hevy={hevy} todaySport={todaySport} trainingIntensity={trainingIntensity} injuries={injuries} maxHeartRate={maxHeartRate} />
          <SportPlanCard sport="running" freq={freqs.running ?? 0} injured={!!injuries.running} activities={activities} savedTargets={(data as any)?.zoneTargets?.running ?? null} onSaveTargets={t => handleSaveTargets('running', t)} />
        </>}
        {mounted && activeTab === 'cycling' && <>
          <CyclingSection activities={activities} hevy={hevy} todaySport={todaySport} trainingIntensity={trainingIntensity} injuries={injuries} maxHeartRate={maxHeartRate} />
          <SportPlanCard sport="cycling" freq={freqs.cycling ?? 0} injured={!!injuries.cycling} activities={activities} savedTargets={(data as any)?.zoneTargets?.cycling ?? null} onSaveTargets={t => handleSaveTargets('cycling', t)} />
        </>}
        {mounted && activeTab === 'swimming' && <>
          <SwimmingSection activities={activities} hevy={hevy} todaySport={todaySport} trainingIntensity={trainingIntensity} injuries={injuries} maxHeartRate={maxHeartRate} />
          <SportPlanCard sport="swimming" freq={freqs.swimming ?? 0} injured={!!injuries.swimming} activities={activities} savedTargets={(data as any)?.zoneTargets?.swimming ?? null} onSaveTargets={t => handleSaveTargets('swimming', t)} />
        </>}
        {mounted && activeTab === 'strength'    && <StrengthSection hevy={hevy} />}
        {mounted && activeTab === 'history'     && <HistorySection activities={activities} hevy={hevy} />}
        {mounted && activeTab === 'performance' && <PerformanceSection />}
      </div>
    </PremiumScreen>
  )
}
