'use client'

import useSWR from 'swr'
import { DetailScreen } from '@/components/DetailScreen'
import { HistorySection } from '../sections'
import { trainingFetcher } from '../fetcher'

export default function HistoryPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <DetailScreen title="History">
      <HistorySection activities={data?.activities ?? []} hevy={data?.hevy ?? []} />
    </DetailScreen>
  )
}
