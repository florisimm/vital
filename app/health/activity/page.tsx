'use client'
import useSWR from 'swr'
import { HealthDetailScreen } from '@/components/HealthDetailScreen'
import { ActivitySection } from '../sections'
import { healthFetcher } from '../fetcher'
export default function ActivityPage() {
  const { data = [] } = useSWR('health-gezondheid', healthFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  return <HealthDetailScreen title="Activity" active="Activity"><ActivitySection rows={data} /></HealthDetailScreen>
}
