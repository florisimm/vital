'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { PremiumScreen } from '@/components/PremiumScreen'
import { OverviewSection } from './sections'
import { trainingFetcher } from './fetcher'
import { createClient } from '@/lib/supabase'

const CATEGORIES = [
  { label: 'Overview',     href: null },
  { label: 'Running',      href: '/training/running' },
  { label: 'Cycling',      href: '/training/cycling' },
  { label: 'Strength',     href: '/training/strength' },
  { label: 'History',      href: '/training/history' },
  { label: 'Performance',  href: '/training/performance' },
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
      {/* Category strip */}
      <div className="flex gap-2.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
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

      <OverviewSection activities={data?.activities ?? []} hevy={data?.hevy ?? []} calendarEvents={data?.calendarEvents ?? []} onRefresh={syncCalendar} refreshing={syncing} />
    </PremiumScreen>
  )
}
