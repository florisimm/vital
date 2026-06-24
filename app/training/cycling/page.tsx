'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { CyclingSection } from '../sections'
import { trainingFetcher } from '../fetcher'
import { InjuryToggle } from '@/components/InjuryToggle'
import { SportPlanCard } from '../SportPlanCard'

export default function CyclingPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const freq = (data as any)?.trainingFrequencies?.cycling ?? 0
  const injured = !!(data as any)?.injuries?.cycling
  return (
    <TrainingDetailScreen
      title="Cycling"
      active="Cycling"
      action={<InjuryToggle sport="cycling" injuries={(data as any)?.injuries ?? {}} />}
    >
      <CyclingSection activities={data?.activities ?? []} />
      <SportPlanCard sport="cycling" freq={freq} injured={injured} />
    </TrainingDetailScreen>
  )
}
