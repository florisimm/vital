'use client'

import useSWR from 'swr'
import { DetailScreen } from '@/components/DetailScreen'
import { StrengthSection } from '../sections'
import { trainingFetcher } from '../fetcher'

export default function StrengthPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return (
    <DetailScreen title="Strength">
      <StrengthSection hevy={data?.hevy ?? []} />
    </DetailScreen>
  )
}
