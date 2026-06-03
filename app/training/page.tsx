'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { RefreshCw } from 'lucide-react'
import { PremiumScreen } from '@/components/PremiumScreen'
import { OverviewSection } from './sections'
import { trainingFetcher } from './fetcher'
import { createClient } from '@/lib/supabase'

const CATEGORIES = [
  { label: 'Overview', href: null },
  { label: 'Running',  href: '/training/running' },
  { label: 'Cycling',  href: '/training/cycling' },
  { label: 'Strength', href: '/training/strength' },
  { label: 'History',  href: '/training/history' },
]

export default function TrainingPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const [syncing, setSyncing] = useState(false)

  async function syncCalendar() {
    if (syncing) return
    setSyncing(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/google-calendar-sync`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) } }
      )
    } catch { /* ignore */ }
    await mutate('training')
    setSyncing(false)
  }

  return (
    <PremiumScreen title="Training" subtitle="Performance signal" contentGap={18}>
      {/* Category strip + refresh */}
      <div className="flex items-center gap-2.5">
        <div className="flex gap-2.5 overflow-x-auto pb-0.5 flex-1" style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map(({ label, href }) =>
            href ? (
              <Link key={label} href={href} prefetch={true}
                className="whitespace-nowrap px-4 py-2.5 rounded-full text-[15px] font-semibold shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}>
                {label}
              </Link>
            ) : (
              <span key={label}
                className="whitespace-nowrap px-4 py-2.5 rounded-full text-[15px] font-semibold shrink-0"
                style={{ background: 'white', color: 'black' }}>
                {label}
              </span>
            )
          )}
        </div>
        <button
          onClick={syncCalendar}
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center active:opacity-60"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          aria-label="Sync calendar"
        >
          <RefreshCw size={15} className={`text-white/60 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <OverviewSection activities={data?.activities ?? []} hevy={data?.hevy ?? []} calendarEvents={data?.calendarEvents ?? []} />
    </PremiumScreen>
  )
}
