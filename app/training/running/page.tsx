'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { RunningSection } from '../sections'
import { trainingFetcher } from '../fetcher'

export default function RunningPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <TrainingDetailScreen title="Running" active="Running">
      <RunningSection activities={data?.activities ?? []} />
    </TrainingDetailScreen>
  )
}
