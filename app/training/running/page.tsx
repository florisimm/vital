'use client'

import useSWR from 'swr'
import { DetailScreen } from '@/components/DetailScreen'
import { RunningSection } from '../sections'
import { trainingFetcher } from '../fetcher'

export default function RunningPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <DetailScreen title="Running">
      <RunningSection activities={data?.activities ?? []} />
    </DetailScreen>
  )
}
