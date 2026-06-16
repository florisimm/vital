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
      className="flex items-center gap-2 px-3 py-2 rounded-[14px] text-[13px] font-semibold active:opacity-60 disabled:opacity-40 transition-colors"
      style={{
        background: injured ? 'rgba(251,146,60,0.12)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${injured ? 'rgba(251,146,60,0.30)' : 'rgba(255,255,255,0.08)'}`,
        color: injured ? 'rgb(251,146,60)' : 'rgba(255,255,255,0.40)',
      }}
    >
      <span className="text-[15px] leading-none">{injured ? '🤕' : '🩹'}</span>
      <span>{injured ? 'Injured — tap to clear' : 'Mark as injured'}</span>
    </button>
  )
}
