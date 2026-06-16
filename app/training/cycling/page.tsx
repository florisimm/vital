'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { CyclingSection } from '../sections'
import { trainingFetcher } from '../fetcher'
import { InjuryToggle } from '@/components/InjuryToggle'

export default function CyclingPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <TrainingDetailScreen title="Cycling" active="Cycling">
      <div className="flex justify-end mb-2">
        <InjuryToggle sport="cycling" injuries={(data as any)?.injuries ?? {}} />
      </div>
      <CyclingSection activities={data?.activities ?? []} />
    </TrainingDetailScreen>
  )
}
