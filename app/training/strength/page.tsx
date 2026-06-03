'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { StrengthSection } from '../sections'
import { trainingFetcher } from '../fetcher'

export default function StrengthPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <TrainingDetailScreen title="Strength" active="Strength">
      <StrengthSection hevy={data?.hevy ?? []} />
    </TrainingDetailScreen>
  )
}
