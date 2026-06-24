'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { RunningSection } from '../sections'
import { trainingFetcher } from '../fetcher'
import { InjuryToggle } from '@/components/InjuryToggle'
import { SportPlanCard } from '../SportPlanCard'

export default function RunningPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const freq = (data as any)?.trainingFrequencies?.running ?? 0
  const injured = !!(data as any)?.injuries?.running
  return (
    <TrainingDetailScreen
      title="Running"
      active="Running"
      action={<InjuryToggle sport="running" injuries={(data as any)?.injuries ?? {}} />}
    >
      <RunningSection activities={data?.activities ?? []} />
      <SportPlanCard sport="running" freq={freq} injured={injured} />
    </TrainingDetailScreen>
  )
}
