'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { CyclingSection } from '../sections'
import { trainingFetcher } from '../fetcher'

export default function CyclingPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <TrainingDetailScreen title="Cycling" active="Cycling">
      <CyclingSection activities={data?.activities ?? []} />
    </TrainingDetailScreen>
  )
}
