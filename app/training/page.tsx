'use client'

import { useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { PremiumScreen } from '@/components/PremiumScreen'
import {
  OverviewSection, RunningSection, CyclingSection,
  SwimmingSection, StrengthSection, HistorySection,
} from './sections'
import { PerformanceSection } from './PerformanceSection'
import { trainingFetcher } from './fetcher'
import { createClient } from '@/lib/supabase'

async function fetchHiddenPages(): Promise<string[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase.from('user_settings').select('hidden_pages').eq('user_id', user.id).single()
  return Array.isArray(data?.hidden_pages) ? data.hidden_pages : []
}

const ALL_TABS = [
  { label: 'Overview',     key: 'overview',     href: null                      },
  { label: 'Running',      key: 'running',      href: '/training/running'      },
  { label: 'Cycling',      key: 'cycling',      href: '/training/cycling'      },
  { label: 'Swimming',     key: 'swimming',     href: '/training/swimming'     },
  { label: 'Strength',     key: 'strength',     href: '/training/strength'     },
  { label: 'History',      key: 'history',      href: '/training/history'      },
  { label: 'Performance',  key: 'performance',  href: '/training/performance'  },
]

export default function TrainingPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const { data: hiddenPages = [] } = useSWR('user-settings-pages', fetchHiddenPages, { revalidateOnFocus: false, dedupingInterval: 300_000 })
  const [activeTab, setActiveTab] = useState('overview')

  const TABS = ALL_TABS.filter(t => !t.href || !hiddenPages.includes(t.href))

  function switchTab(key: string) {
    setActiveTab(key)
    window.scrollTo({ top: 0, behavior: 'instant' })
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

  return (
    <PremiumScreen title="Training" subtitle="Performance signal" contentGap={18}>
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

      {/* Tab content */}
      {activeTab === 'overview'    && <OverviewSection activities={activities} hevy={hevy} calendarEvents={calendarEvents} />}
      {activeTab === 'running'     && <RunningSection activities={activities} />}
      {activeTab === 'cycling'     && <CyclingSection activities={activities} />}
      {activeTab === 'swimming'    && <SwimmingSection activities={activities} />}
      {activeTab === 'strength'    && <StrengthSection hevy={hevy} />}
      {activeTab === 'history'     && <HistorySection activities={activities} hevy={hevy} />}
      {activeTab === 'performance' && <PerformanceSection />}
    </PremiumScreen>
  )
}
