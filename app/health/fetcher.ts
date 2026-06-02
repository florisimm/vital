import { createClient } from '@/lib/supabase'
import type { GezondheidsRow } from './sections'

export async function healthFetcher(): Promise<GezondheidsRow[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const { data } = await supabase
    .from('gezondheid').select('datum,stappen,gewicht')
    .eq('user_id', user.id).order('datum', { ascending: false }).limit(30)
  return (data ?? []) as GezondheidsRow[]
}
