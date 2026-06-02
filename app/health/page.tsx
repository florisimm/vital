'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { PremiumScreen } from '@/components/PremiumScreen'
import { MetricRow } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import type { GezondheidsRow } from './sections'

async function fetchHealth() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const { data } = await supabase
    .from('gezondheid').select('datum,stappen,gewicht')
    .eq('user_id', user.id).order('datum', { ascending: false }).limit(30)
  return (data ?? []) as GezondheidsRow[]
}

const CATEGORIES = [
  { label: 'Sleep',    href: '/health/sleep'    },
  { label: 'Recovery', href: '/health/recovery' },
  { label: 'Heart',    href: '/health/heart'    },
  { label: 'Weight',   href: '/health/weight'   },
  { label: 'Activity', href: '/health/activity' },
]

export default function HealthPage() {
  const { data: rows = [] } = useSWR('health-gezondheid', fetchHealth, {
    revalidateOnFocus: false, dedupingInterval: 60_000,
  })

  const latest = rows[0]
  const steps = latest?.stappen ?? null
  const weight = latest?.gewicht ? Number(latest.gewicht).toFixed(1) : null

  return (
    <PremiumScreen title="Health" subtitle="Recovery foundation" contentGap={18}>

      {/* Category strip — all pills navigate to detail pages */}
      <div className="flex gap-2.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
        {CATEGORIES.map(({ label, href }) => (
          <Link key={label} href={href} prefetch={true}
            className="whitespace-nowrap px-4 py-2.5 rounded-full text-[15px] font-semibold shrink-0 transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}>
            {label}
          </Link>
        ))}
      </div>

      {/* Metric rows — real data only */}
      {weight && (
        <MetricRow
          title="Weight"
          value={`${weight} kg`}
          detail="Latest measurement"
        />
      )}
      {steps && (
        <MetricRow
          title="Daily activity"
          value={`${Number(steps).toLocaleString('nl-NL')} stappen`}
          detail="Vandaag"
        />
      )}

    </PremiumScreen>
  )
}
