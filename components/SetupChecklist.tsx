'use client'

import useSWR from 'swr'
import { Check, ChevronRight } from 'lucide-react'
import { fetchServices, openDevices, type Services } from '@/lib/services'

const ITEMS: { key: keyof Services; emoji: string; label: string; desc: string }[] = [
  { key: 'fitbit', emoji: '⌚', label: 'Google Health', desc: 'Sleep, HRV & readiness' },
  { key: 'strava', emoji: '🏃', label: 'Strava',        desc: 'Runs, rides & swims' },
  { key: 'hevy',   emoji: '🏋️', label: 'Hevy',          desc: 'Strength training' },
  { key: 'google', emoji: '📅', label: 'Google Calendar', desc: 'Your training schedule' },
]

// Onboarding nudge on the Today tab: shows which data sources are still missing
// and links straight into the connect screen. Disappears once everything is
// connected so it never nags an established user.
export function SetupChecklist() {
  const { data: services } = useSWR('profile-services', fetchServices, {
    revalidateOnFocus: false, dedupingInterval: 300_000,
  })

  if (!services) return null
  // Google Health can be "connected" yet have a dead refresh token — treat that
  // as not-done so the checklist nudges a reconnect instead of showing green.
  const isDone = (key: keyof Services) =>
    key === 'fitbit' ? services.fitbit && !services.fitbitNeedsReconnect : !!services[key]
  const connectedCount = ITEMS.filter(i => isDone(i.key)).length
  if (connectedCount === ITEMS.length) return null // all set — hide entirely

  return (
    <div className="rounded-[20px] p-4"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[15px] font-semibold text-white">Finish setting up</p>
        <span className="text-[12px] font-medium text-white/40">{connectedCount}/{ITEMS.length} connected</span>
      </div>
      <p className="text-[12.5px] text-white/45 mb-3 leading-relaxed">
        Connect your sources so Kern can give you accurate readiness, recovery and training advice.
      </p>

      <div className="flex flex-col gap-2">
        {ITEMS.map(item => {
          const on = isDone(item.key)
          const reconnect = item.key === 'fitbit' && services.fitbit && services.fitbitNeedsReconnect
          return (
            <button
              key={item.key}
              onClick={() => { if (!on) openDevices() }}
              disabled={on}
              className="flex items-center gap-3 px-3.5 py-3 rounded-[14px] text-left transition-all"
              style={{
                background: on ? 'rgba(74,222,128,0.07)' : reconnect ? 'rgba(251,146,60,0.08)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${on ? 'rgba(74,222,128,0.22)' : reconnect ? 'rgba(251,146,60,0.28)' : 'rgba(255,255,255,0.08)'}`,
              }}>
              <span className="text-[20px] shrink-0">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-white leading-tight">{item.label}</p>
                <p className={`text-[12px] mt-0.5 ${reconnect ? 'text-orange-300' : 'text-white/40'}`}>
                  {reconnect ? 'Connection expired — tap to reconnect' : item.desc}
                </p>
              </div>
              {on ? (
                <span className="flex items-center gap-1 text-[13px] font-semibold text-green-400 shrink-0">
                  <Check size={15} strokeWidth={2.6} /> Done
                </span>
              ) : (
                <span className={`flex items-center gap-0.5 text-[13px] font-semibold shrink-0 ${reconnect ? 'text-orange-400' : 'text-teal-400'}`}>
                  {reconnect ? 'Reconnect' : 'Connect'} <ChevronRight size={15} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
