'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

export type PlannedItem = {
  title: string
  time: string | null
  done: boolean
  sport: string
  emoji: string
}

type FeedbackLevel = 'easier' | 'about_right' | 'very_hard'

const BUTTONS: { level: FeedbackLevel; label: string; sub: string; color: string }[] = [
  { level: 'easier',      label: 'Light',  sub: 'Easy effort',   color: '#4ade80' },
  { level: 'about_right', label: 'Medium', sub: 'Solid session', color: '#facc15' },
  { level: 'very_hard',   label: 'Heavy',  sub: 'Hard / maxed',  color: '#fb923c' },
]

export function PlannedTodayCard({ items, defaultSport, readinessPct, recoveryPct }: {
  items: PlannedItem[]
  defaultSport: string
  readinessPct?: number
  recoveryPct?: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const [selected, setSelected] = useState<FeedbackLevel | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [savedLabel, setSavedLabel] = useState<string | null>(null)

  const anyDone = items.some(i => i.done)

  async function submit(level: FeedbackLevel, label: string) {
    if (submitting) return
    setSubmitting(true)
    setSelected(level)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const todayStr = new Date().toISOString().slice(0, 10)
      const sport = items.find(i => i.done)?.sport ?? items[0]?.sport ?? defaultSport

      // Attach the felt intensity to today's coach_overrides rows (created by the
      // auto-detection) so the learning system can use it. Insert a standalone
      // row if none exists yet.
      const { data: updated } = await supabase
        .from('coach_overrides')
        .update({ session_feedback: level })
        .eq('user_id', user.id)
        .eq('date', todayStr)
        .select('id')
      if (!updated || updated.length === 0) {
        await supabase.from('coach_overrides').insert({
          user_id: user.id, date: todayStr, sport_type: sport,
          coach_advice: 'planned', user_action: 'trained', session_feedback: level,
        })
      }

      // Also record in session_feedback for history
      await fetch('/api/training/session-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          workout_date: todayStr,
          workout_type: sport,
          workout_id: `manual-${todayStr}`,
          feedback_level: level,
          coach_advice: 'planned',
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {})

      setSavedLabel(label)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-5 rounded-[24px] border border-white/[0.12]" style={{ background: 'rgba(45,212,191,0.07)' }}>
      <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em] mb-4">Today's Plan</p>

      {items.length > 0 ? (
        <div className="flex flex-col gap-2.5 mb-4">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[28px] leading-none">{it.emoji}</span>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[17px] font-bold text-white leading-tight truncate">{it.title}</span>
                {it.time && <span className="text-[12px] text-white/40">{it.time}</span>}
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={it.done
                  ? { background: '#4ade80', color: '#000' }
                  : { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)' }}
              >
                {it.done ? '✓ Done' : 'Planned'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[28px] leading-none">🗓️</span>
          <span className="text-[16px] font-semibold text-white/70">Nothing planned today</span>
        </div>
      )}

      {(readinessPct !== undefined || recoveryPct !== undefined) && (
        <div className="flex items-center gap-3 mb-3">
          {readinessPct !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-white/30 uppercase tracking-[0.08em]">Readiness</span>
              <span
                className="text-[13px] font-bold"
                style={{ color: readinessPct >= 75 ? '#4ade80' : readinessPct >= 50 ? '#facc15' : '#fb923c' }}
              >{readinessPct}%</span>
            </div>
          )}
          {readinessPct !== undefined && recoveryPct !== undefined && (
            <span className="text-white/20 text-[11px]">·</span>
          )}
          {recoveryPct !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-white/30 uppercase tracking-[0.08em]">Recovery</span>
              <span
                className="text-[13px] font-bold"
                style={{ color: recoveryPct >= 75 ? '#4ade80' : recoveryPct >= 50 ? '#facc15' : '#fb923c' }}
              >{recoveryPct}%</span>
            </div>
          )}
        </div>
      )}

      <div className="pt-3 border-t border-white/[0.08]">
        {savedLabel ? (
          <div className="flex flex-col items-center gap-1 py-2">
            <span className="text-[14px] font-semibold text-white">Logged: {savedLabel}</span>
            <span className="text-[12px] text-white/40">Kern learns from how your sessions feel</span>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.08em] mb-2.5">
              {anyDone ? 'How hard was it?' : 'Rate today when done'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {BUTTONS.map(b => (
                <button
                  key={b.level}
                  onClick={() => submit(b.level, b.label)}
                  disabled={submitting}
                  className={`flex flex-col items-center gap-0.5 py-2.5 rounded-[14px] transition-all ${
                    selected === b.level ? 'ring-2 ring-white/25' : ''
                  } ${submitting ? 'opacity-50' : 'active:opacity-70'}`}
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <span className="text-[15px] font-bold" style={{ color: b.color }}>{b.label}</span>
                  <span className="text-[11px] text-white/40">{b.sub}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
