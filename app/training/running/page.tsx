'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { RunningSection } from '../sections'
import { trainingFetcher } from '../fetcher'
import { InjuryToggle } from '@/components/InjuryToggle'

export default function RunningPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <TrainingDetailScreen
      title="Running"
      active="Running"
      action={<InjuryToggle sport="running" injuries={(data as any)?.injuries ?? {}} />}
    >
      <RunningSection activities={data?.activities ?? []} />
    </TrainingDetailScreen>
  )
}
