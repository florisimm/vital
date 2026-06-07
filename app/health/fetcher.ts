'use client'

import { createClient } from '@/lib/supabase'
import type { GezondheidsRow } from './sections'

export async function healthFetcher(): Promise<GezondheidsRow[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const { data } = await supabase
    .from('gezondheid')
    .select('datum,stappen,gewicht,hartslag_rust,hrv_rmssd,slaap_minuten,slaap_score,slaap_diep,slaap_licht,slaap_rem')
    .eq('user_id', user.id).order('datum', { ascending: false }).limit(30)
  return (data ?? []) as GezondheidsRow[]
}
