'use client'

import useSWR, { useSWRConfig } from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { RunningSection, computeRecoveryDetail } from '../sections'
import { trainingFetcher } from '../fetcher'
import { InjuryToggle } from '@/components/InjuryToggle'
import { SportPlanCard } from '../SportPlanCard'
import { computePhysiologyReadiness, type HealthRow } from '@/lib/readiness'
import { createClient } from '@/lib/supabase'
import type { ZoneTargets } from '@/lib/training-plan'

export default function RunningPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const { data: healthRows } = useSWR<HealthRow[]>('health-gezondheid', null)
  const { mutate } = useSWRConfig()

  const freq = (data as any)?.trainingFrequencies?.running ?? 0
  const injured = !!(data as any)?.injuries?.running
  const activities = data?.activities ?? []
  const maxHeartRate = (data as any)?.maxHeartRate ?? undefined

  const physiology = computePhysiologyReadiness(healthRows ?? [])
  const recovery = computeRecoveryDetail(activities, data?.hevy ?? [], maxHeartRate)
  const readinessPct = physiology.score !== null
    ? Math.round(physiology.score * 0.70 + recovery.pct * 0.30)
    : recovery.pct

  const savedTargets = (data as any)?.zoneTargets?.running ?? null

  async function handleSaveTargets(newTargets: ZoneTargets) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('user_settings')
      .update({ training_zone_targets: { ...(data as any)?.zoneTargets, running: newTargets } })
      .eq('user_id', user.id)
    mutate('training')
  }

  return (
    <TrainingDetailScreen
      title="Running"
      active="Running"
      action={<InjuryToggle sport="running" injuries={(data as any)?.injuries ?? {}} />}
    >
      <RunningSection activities={activities} />
      <SportPlanCard
        sport="running"
        freq={freq}
        injured={injured}
        activities={activities}
        trainingIntensity={(data as any)?.trainingIntensity}
        readinessPct={readinessPct}
        savedTargets={savedTargets}
        onSaveTargets={handleSaveTargets}
      />
    </TrainingDetailScreen>
  )
}
