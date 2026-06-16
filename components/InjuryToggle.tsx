'use client'

import { useState } from 'react'
import { mutate } from 'swr'
import { createClient } from '@/lib/supabase'

export function InjuryToggle({ sport, injuries }: { sport: string; injuries: Record<string, boolean> }) {
  const [saving, setSaving] = useState(false)
  const injured = injuries[sport] ?? false

  async function toggle() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const next = { ...injuries, [sport]: !injured }
    await supabase.from('user_settings').update({ training_injuries: next }).eq('user_id', user.id)
    mutate('training')
    mutate('today')
    setSaving(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      aria-label={injured ? 'Clear injury' : 'Mark as injured'}
      className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[18px] leading-none active:opacity-60 disabled:opacity-40"
      style={{
        background: injured ? 'rgba(251,146,60,0.18)' : 'rgba(255,255,255,0.10)',
        border: `1px solid ${injured ? 'rgba(251,146,60,0.40)' : 'rgba(255,255,255,0.18)'}`,
      }}
    >
      {injured ? '🤕' : '🩹'}
    </button>
  )
}
