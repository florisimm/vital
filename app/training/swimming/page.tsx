'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { SwimmingSection } from '../sections'
import { trainingFetcher } from '../fetcher'

export default function SwimmingPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <TrainingDetailScreen title="Swimming" active="Swimming">
      <SwimmingSection activities={data?.activities ?? []} />
    </TrainingDetailScreen>
  )
}
