'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

import {
  computeZones,
  computeWeekProgress,
  suggestZoneTargets,
  applyWeeklyProgression,
  getISOWeek,
  type ZoneTargets,
} from '@/lib/training-plan'

function formatMinutes(min: number): string {
  if (min <= 0) return '0 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function ProgressBar({ done, target }: { done: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (done / target) * 100) : 0
  const color = pct >= 100 ? '#4ade80' : pct >= 50 ? '#fb923c' : 'rgba(255,255,255,0.15)'
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

export function SportPlanCard({
  sport,
  freq,
  injured,
  activities = [],
  readinessPct,
  savedTargets,
  onSaveTargets,
}: {
  sport: 'running' | 'cycling' | 'swimming'
  freq: number
  injured?: boolean
  activities?: any[]
  trainingIntensity?: string
  readinessPct?: number
  savedTargets?: ZoneTargets | null
  onSaveTargets?: (t: ZoneTargets) => Promise<void>
}) {
  const [editingZone, setEditingZone] = useState<'z2' | 'quality' | null>(null)
  const [saving, setSaving] = useState(false)
  const progressionAppliedRef = useRef<string | null>(null)

  const zones = useMemo(() => computeZones(activities, sport), [activities, sport])
  const suggested = useMemo(() => suggestZoneTargets(sport, freq), [sport, freq])
  const targets = savedTargets ?? suggested
  const progress = useMemo(() => computeWeekProgress(activities, sport, zones, undefined, 0), [activities, sport, zones])
  const lastWeekProgress = useMemo(() => computeWeekProgress(activities, sport, zones, undefined, -1), [activities, sport, zones])

  // Auto-progression: at start of each new week, check last week adherence and bump targets
  useEffect(() => {
    if (!savedTargets || !onSaveTargets) return
    const now = new Date()
    const currentWeek = getISOWeek(now)
    const currentYear = now.getFullYear()
    if (savedTargets.updatedWeek === currentWeek && savedTargets.updatedYear === currentYear) return

    const key = `${currentYear}-${currentWeek}`
    if (progressionAppliedRef.current === key) return
    progressionAppliedRef.current = key

    const lastTotal = lastWeekProgress.z2Minutes + lastWeekProgress.qualityMinutes
    const targetTotal = savedTargets.z2Minutes + savedTargets.qualityMinutes
    const adherence = targetTotal > 0 ? (lastTotal / targetTotal) * 100 : 0
    const progressed = applyWeeklyProgression(savedTargets, adherence)
    onSaveTargets({ ...progressed, updatedWeek: currentWeek, updatedYear: currentYear })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTargets?.updatedWeek, savedTargets?.updatedYear])

  async function handleAdjust(zone: 'z2' | 'quality', delta: number) {
    if (!onSaveTargets || saving) return
    const now = new Date()
    const newTargets: ZoneTargets = {
      ...targets,
      z2Minutes: zone === 'z2' ? Math.max(15, targets.z2Minutes + delta) : targets.z2Minutes,
      qualityMinutes: zone === 'quality' ? Math.max(0, targets.qualityMinutes + delta) : targets.qualityMinutes,
      updatedWeek: getISOWeek(now),
      updatedYear: now.getFullYear(),
    }
    setSaving(true)
    await onSaveTargets(newTargets)
    setSaving(false)
  }

  const z2Remaining = Math.max(0, targets.z2Minutes - progress.z2Minutes)
  const qualityRemaining = Math.max(0, targets.qualityMinutes - progress.qualityMinutes)

  let adviceText: string | null = null
  if (readinessPct !== undefined && readinessPct < 70) {
    adviceText = 'Easy day — recovery takes priority'
  } else if (qualityRemaining > 0 && readinessPct !== undefined && readinessPct >= 85) {
    adviceText = `Good day for a quality session — ${formatMinutes(qualityRemaining)} left`
  } else if (z2Remaining > 0) {
    adviceText = `Zone 2 focus today — ${formatMinutes(z2Remaining)} left this week`
  } else {
    adviceText = 'Weekly targets complete — great work!'
  }

  return (
    <div className="mt-6 mb-2">
      {freq > 0 && <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em]">Weekly zone targets</p>
        <span className="text-[12px] font-medium text-white/30">{formatMinutes(freq * 60)}/week</span>
      </div>

      {adviceText && (
        <p className="text-[12px] text-white/40 mb-3 leading-snug">{adviceText}</p>
      )}

      <div
        className="rounded-[20px] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Zone 2 */}
        <div>
          <button
            className="w-full flex items-center gap-3 px-4 py-3.5 active:opacity-70 transition-opacity text-left"
            onClick={() => setEditingZone(editingZone === 'z2' ? null : 'z2')}
          >
            <span className="text-[18px] leading-none w-7 shrink-0 text-center">🟢</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white/80">Zone 2</p>
              <div className="flex items-center gap-2 mt-1.5">
                <ProgressBar done={progress.z2Minutes} target={targets.z2Minutes} />
                <span className="text-[11px] text-white/35 shrink-0 tabular-nums">
                  {formatMinutes(progress.z2Minutes)} / {formatMinutes(targets.z2Minutes)}
                </span>
              </div>
              <p className="text-[10px] text-white/20 mt-1 leading-snug">No HR monitor? Name your activity 'easy run', 'zone 2' or 'endurance'</p>
            </div>
          </button>
          {editingZone === 'z2' && (
            <div
              className="flex items-center justify-between px-4 pb-3.5 gap-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:opacity-50 shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                onClick={() => handleAdjust('z2', -15)}
                disabled={saving}
              >
                <span className="text-[18px] leading-none select-none">−</span>
              </button>
              <span className="text-[12px] text-white/40 text-center">Zone 2 target: {formatMinutes(targets.z2Minutes)}</span>
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:opacity-50 shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                onClick={() => handleAdjust('z2', 15)}
                disabled={saving}
              >
                <span className="text-[18px] leading-none select-none">+</span>
              </button>
            </div>
          )}
        </div>

        {/* Quality */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            className="w-full flex items-center gap-3 px-4 py-3.5 active:opacity-70 transition-opacity text-left"
            onClick={() => setEditingZone(editingZone === 'quality' ? null : 'quality')}
          >
            <span className="text-[18px] leading-none w-7 shrink-0 text-center">⚡</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white/80">{QUALITY_LABEL[sport]}</p>
              <p className="text-[11px] text-white/30 leading-none mt-0.5">{QUALITY_DESC[sport]}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <ProgressBar done={progress.qualityMinutes} target={targets.qualityMinutes} />
                <span className="text-[11px] text-white/35 shrink-0 tabular-nums">
                  {formatMinutes(progress.qualityMinutes)} / {formatMinutes(targets.qualityMinutes)}
                </span>
              </div>
              <p className="text-[10px] text-white/20 mt-1 leading-snug">No HR monitor? Name your activity 'interval' or 'tempo'</p>
            </div>
          </button>
          {editingZone === 'quality' && (
            <div
              className="flex items-center justify-between px-4 pb-3.5 gap-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:opacity-50 shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                onClick={() => handleAdjust('quality', -15)}
                disabled={saving}
              >
                <span className="text-[18px] leading-none select-none">−</span>
              </button>
              <span className="text-[12px] text-white/40 text-center">Quality target: {formatMinutes(targets.qualityMinutes)}</span>
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:opacity-50 shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                onClick={() => handleAdjust('quality', 15)}
                disabled={saving}
              >
                <span className="text-[18px] leading-none select-none">+</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banners */}
      {injured && (
        <div
          className="mt-3 px-4 py-3 rounded-[16px] flex items-center gap-3"
          style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.18)' }}
        >
          <span className="text-[18px]">🤕</span>
          <p className="text-[13px] text-orange-400/80 leading-snug">Active injury — train at your own discretion</p>
        </div>
      )}
      {!injured && readinessPct !== undefined && readinessPct < 70 && (
        <div
          className="mt-3 px-4 py-3 rounded-[16px] flex items-center gap-3"
          style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.15)' }}
        >
          <span className="text-[18px]">🌿</span>
          <p className="text-[13px] text-orange-400/70 leading-snug">Recovery day recommended — keep it easy today</p>
        </div>
      )}
      {!injured && readinessPct !== undefined && readinessPct >= 85 && (
        <div
          className="mt-3 px-4 py-3 rounded-[16px] flex items-center gap-3"
          style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.18)' }}
        >
          <span className="text-[18px]">✅</span>
          <p className="text-[13px] text-green-400/80 leading-snug">Body is ready — push quality today</p>
        </div>
      )}

      </>}
    </div>
  )
}

const QUALITY_LABEL: Record<string, string> = {
  running:  'Intervals & tempo',
  cycling:  'Intervals',
  swimming: 'Intervals',
}

const QUALITY_DESC: Record<string, string> = {
  running:  'tempo runs, drempeltraining, VO2max',
  cycling:  'FTP-blokken, drempelritten, VO2max',
  swimming: 'snelheidssessies, intervallen',
}
