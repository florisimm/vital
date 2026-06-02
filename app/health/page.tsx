'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { BedDouble, Activity, Heart, Scale, Footprints } from 'lucide-react'
import { PremiumScreen } from '@/components/PremiumScreen'
import { Card, MetricTile, MetricRow } from '@/components/ui'
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

      {/* Overview tiles — always visible on main Health page */}
      <div className="grid grid-cols-2 gap-3">
        <MetricTile title="Sleep score" value="91" unit="" note="Excellent"
          Icon={BedDouble} tint="text-blue-400" />
        <MetricTile title="HRV" value="64" unit="ms" note="+6 baseline"
          Icon={Activity} tint="text-green-400" />
      </div>

      {/* Metric rows */}
      <MetricRow title="Resting heart rate" value="46 bpm"   detail="Stable overnight" />
      <MetricRow
        title="Weight trend"
        value={weight ? `${weight} kg` : '72.4 kg'}
        detail="Flat 14-day trend"
      />
      <MetricRow
        title="Daily activity"
        value={steps ? `${Number(steps).toLocaleString('nl-NL')} steps` : '8,210 steps'}
        detail="Enough movement before training"
      />

      {/* Recommendation card */}
      <Card>
        <div className="flex flex-col gap-2.5">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">
            Recommendation
          </span>
          <p className="text-[22px] font-bold text-white leading-snug">
            Recovery supports aerobic training today. Do not add intensity.
          </p>
        </div>
      </Card>

    </PremiumScreen>
  )
}
