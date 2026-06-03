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
  { label: 'Overview', href: null               },
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

  // Weight trend: compare latest vs 7 days ago
  const weightRows = rows.filter(r => r.gewicht != null)
  const latestWeight = weightRows[0] ? Number(weightRows[0].gewicht) : null
  const oldWeight = weightRows[6] ? Number(weightRows[6].gewicht) : null
  const weightChange = latestWeight && oldWeight ? latestWeight - oldWeight : null
  const weightDetail = weightChange !== null
    ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg vs 7 dagen`
    : '–'

  // Steps: 7-day average
  const stepRows = rows.filter(r => r.stappen != null).slice(0, 7)
  const avgSteps = stepRows.length
    ? Math.round(stepRows.reduce((s, r) => s + Number(r.stappen), 0) / stepRows.length)
    : null
  const stepsDetail = avgSteps ? `gem. ${avgSteps.toLocaleString('nl-NL')} / dag` : '–'

  return (
    <PremiumScreen title="Health" subtitle="Recovery foundation" contentGap={18}>

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

      {/* Overview tiles — always visible on main Health page */}
      <div className="grid grid-cols-2 gap-3">
        <MetricTile title="Sleep score" value="–" unit="" note="–"
          Icon={BedDouble} tint="text-blue-400" />
        <MetricTile title="HRV" value="–" unit="" note="–"
          Icon={Activity} tint="text-green-400" />
      </div>

      {/* Metric rows */}
      <MetricRow title="Resting heart rate" value="–" detail="–" />
      <MetricRow
        title="Weight trend"
        value={weight ? `${weight} kg` : '–'}
        detail={weightDetail}
      />
      <MetricRow
        title="Daily activity"
        value={steps ? `${Number(steps).toLocaleString('nl-NL')} steps` : '–'}
        detail={stepsDetail}
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
