'use client'

import useSWR from 'swr'
import { DetailScreen } from '@/components/DetailScreen'
import { CyclingSection } from '../sections'
import { trainingFetcher } from '../fetcher'

export default function CyclingPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <DetailScreen title="Cycling">
      <CyclingSection activities={data?.activities ?? []} />
    </DetailScreen>
  )
}
