'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { SwimmingSection } from '../sections'
import { trainingFetcher } from '../fetcher'
import { InjuryToggle } from '@/components/InjuryToggle'

export default function SwimmingPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <TrainingDetailScreen title="Swimming" active="Swimming">
      <div className="flex justify-end mb-2">
        <InjuryToggle sport="swimming" injuries={(data as any)?.injuries ?? {}} />
      </div>
      <SwimmingSection activities={data?.activities ?? []} />
    </TrainingDetailScreen>
  )
}
