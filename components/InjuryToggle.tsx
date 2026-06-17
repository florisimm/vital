'use client'

import { useState, useEffect } from 'react'
import { mutate } from 'swr'
import { createClient } from '@/lib/supabase'

export function InjuryToggle({ sport, injuries }: { sport: string; injuries: Record<string, boolean> }) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const injured = optimistic !== null ? optimistic : (injuries[sport] ?? false)

  // Clear optimistic once SWR has synced the new value from the DB
  useEffect(() => {
    if (optimistic !== null && (injuries[sport] ?? false) === optimistic) {
      setOptimistic(null)
    }
  }, [injuries, sport, optimistic])

  async function toggle() {
    const next = !injured
    setOptimistic(next)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setOptimistic(null); return }
    await supabase.from('user_settings').update({ training_injuries: { ...injuries, [sport]: next } }).eq('user_id', user.id)
    mutate('training')
    mutate('today')
  }

  return (
    <button
      onClick={toggle}
      aria-label={injured ? 'Clear injury' : 'Mark as injured'}
      className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[18px] leading-none active:opacity-60"
      style={{
        background: injured ? 'rgba(251,146,60,0.18)' : 'rgba(255,255,255,0.10)',
        border: `1px solid ${injured ? 'rgba(251,146,60,0.40)' : 'rgba(255,255,255,0.18)'}`,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {injured ? '🤕' : '🩹'}
    </button>
  )
}
