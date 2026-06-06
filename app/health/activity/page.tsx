'use client'
import useSWR from 'swr'
import { HealthDetailScreen } from '@/components/HealthDetailScreen'
import { ActivitySection } from '../sections'
import { healthFetcher } from '../fetcher'
import { createClient } from '@/lib/supabase'

async function fetchUserSettings() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { step_goal: 10000 }
  const { data } = await supabase
    .from('user_settings')
    .select('step_goal')
    .eq('user_id', user.id)
    .single()
  return { step_goal: Number(data?.step_goal ?? 10000) }
}

export default function ActivityPage() {
  const { data = [] } = useSWR('health-gezondheid', healthFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const { data: settings } = useSWR('user-settings', fetchUserSettings, { revalidateOnFocus: false, dedupingInterval: 300_000 })
  return (
    <HealthDetailScreen title="Activity" active="Activity">
      <ActivitySection rows={data} stepGoal={settings?.step_goal ?? 10000} />
    </HealthDetailScreen>
  )
}
