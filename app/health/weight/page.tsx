'use client'
import useSWR from 'swr'
import { HealthDetailScreen } from '@/components/HealthDetailScreen'
import { WeightSection } from '../sections'
import { healthFetcher } from '../fetcher'
export default function WeightPage() {
  const { data = [] } = useSWR('health-gezondheid', healthFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return <HealthDetailScreen title="Weight & Body" active="Weight & Body"><WeightSection rows={data} /></HealthDetailScreen>
}
