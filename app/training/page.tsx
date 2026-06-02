'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { PremiumScreen } from '@/components/PremiumScreen'
import { OverviewSection } from './sections'
import { trainingFetcher } from './fetcher'

const CATEGORIES = [
  { label: 'Overview', href: null },
  { label: 'Running',  href: '/training/running' },
  { label: 'Cycling',  href: '/training/cycling' },
  { label: 'Strength', href: '/training/strength' },
  { label: 'History',  href: '/training/history' },
]

export default function TrainingPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })

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

      <OverviewSection activities={data?.activities ?? []} hevy={data?.hevy ?? []} />
    </PremiumScreen>
  )
}
