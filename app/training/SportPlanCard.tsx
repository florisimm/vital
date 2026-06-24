'use client'

import { ArrowRight } from 'lucide-react'

type Session = { title: string; subtitle: string; duration: string; emoji: string; href: string }

const SESSIONS: Record<string, Session[]> = {
  running: [
    { title: 'Easy run',          subtitle: 'Zone 2 — conversational pace',          duration: '45–60 min', emoji: '🏃', href: '/training/session?title=Easy+Run' },
    { title: 'Interval training', subtitle: '5×1 km at 5K pace — VO₂max boost',      duration: '30–40 min', emoji: '⚡', href: '/training/session?title=Running+Intervals' },
    { title: 'Long run',          subtitle: 'Slow & steady — builds endurance base',  duration: '60–90 min', emoji: '🛣️', href: '/training/session?title=Long+Run' },
    { title: 'Tempo run',         subtitle: 'Comfortably hard — lactate threshold',   duration: '35–45 min', emoji: '🔥', href: '/training/session?title=Tempo+Run' },
    { title: 'Hill repeats',      subtitle: '6–8 × 90s uphill — strength & power',   duration: '40–50 min', emoji: '⛰️', href: '/training/session?title=Hill+Repeats' },
  ],
  cycling: [
    { title: 'Endurance ride', subtitle: 'Zone 2 — fat metabolism & aerobic base',   duration: '60–90 min',  emoji: '🚴', href: '/training/session?title=Endurance+Ride' },
    { title: 'FTP intervals',  subtitle: '3×10 min threshold — raise FTP',            duration: '50–60 min',  emoji: '⚡', href: '/training/session?title=FTP+Intervals' },
    { title: 'Long ride',      subtitle: 'Steady endurance — big aerobic volume',     duration: '90–120 min', emoji: '🛣️', href: '/training/session?title=Long+Ride' },
    { title: 'Recovery ride',  subtitle: 'Easy spin — flush legs & recover',          duration: '30–45 min',  emoji: '🌱', href: '/training/session?title=Recovery+Ride' },
    { title: 'VO₂max effort',  subtitle: '5×3 min at 110% FTP — aerobic ceiling',    duration: '50–65 min',  emoji: '🔥', href: '/training/session?title=VO2max+Cycling' },
  ],
  swimming: [
    { title: 'Endurance swim',   subtitle: 'Steady aerobic pace — 2000–3000m',         duration: '45–60 min', emoji: '🏊', href: '/training/session?title=Endurance+Swim' },
    { title: 'Speed intervals',  subtitle: '8×100m with 20s rest — pace work',          duration: '45–55 min', emoji: '⚡', href: '/training/session?title=Swimming+Intervals' },
    { title: 'Technique drills', subtitle: 'Pull buoy, catch drills, form focus',       duration: '40–50 min', emoji: '🎯', href: '/training/session?title=Swim+Technique' },
    { title: 'Mixed session',    subtitle: 'Warm-up + speed + endurance + cool-down',  duration: '55–70 min', emoji: '🌊', href: '/training/session?title=Swimming' },
  ],
}

export function SportPlanCard({ sport, freq, injured }: {
  sport: 'running' | 'cycling' | 'swimming'
  freq: number
  injured?: boolean
}) {
  if (freq === 0) return null
  const sessions = (SESSIONS[sport] ?? []).slice(0, Math.min(freq, SESSIONS[sport]?.length ?? 0))
  if (sessions.length === 0) return null

  return (
    <div className="mt-6 mb-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em]">Weekly plan</p>
        <span className="text-[12px] font-medium text-white/30">{freq}× per week</span>
      </div>

      {injured && (
        <div
          className="mb-3 px-4 py-3 rounded-[16px] flex items-center gap-3"
          style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.18)' }}
        >
          <span className="text-[18px]">🤕</span>
          <p className="text-[13px] text-orange-400/80 leading-snug">Active injury — train at your own discretion</p>
        </div>
      )}

      <div
        className="rounded-[20px] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {sessions.map((s, i) => (
          <a
            key={i}
            href={s.href}
            className="flex items-center gap-4 px-4 py-4 active:opacity-70 transition-opacity"
            style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined }}
          >
            <span className="text-[22px] leading-none w-8 shrink-0 text-center">{s.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-white leading-snug">{s.title}</p>
              <p className="text-[12px] text-white/35 mt-0.5 leading-snug">{s.subtitle}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[12px] text-white/25">{s.duration}</span>
              <ArrowRight size={13} className="text-white/20" />
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
