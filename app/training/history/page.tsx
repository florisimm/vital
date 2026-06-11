'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { HistorySection } from '../sections'
import { trainingFetcher } from '../fetcher'

export default function HistoryPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <TrainingDetailScreen title="Log" active="Log">
      <HistorySection activities={data?.activities ?? []} hevy={data?.hevy ?? []} />
    </TrainingDetailScreen>
  )
}
