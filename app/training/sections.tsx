'use client'

import { useState } from 'react'
import { TrendingUp, Timer, Dumbbell, Bike, PersonStanding, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Card, SectionHeader, MinimalWorkoutList } from '@/components/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Activity = {
  id: number; name: string; sport_type: string; start_date: string
  distance: number | null; moving_time: number | null; elapsed_time: number | null
  total_elevation_gain: number | null; average_speed: number | null
  average_heartrate: number | null; average_cadence: number | null; kilojoules: number | null
}

export type HevyWorkout = {
  id: string; title: string; start_time: string; end_time: string | null
  duration: number | null; volume_kg: number | null; sets: number | null
  exercises: Array<{ title: string; sets: Array<{ weight_kg: number; reps: number }> }> | null
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function startOfWeek() {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString()
}

export function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}u ${m}m` : `${m}m`
}

export function formatPace(mPerSec: number) {
  const s = 1000 / mPerSec
  return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function sportIcon(type: string): 'run' | 'ride' | 'strength' {
  if (type?.toLowerCase().includes('run')) return 'run'
  if (type?.toLowerCase().includes('ride') || type?.toLowerCase().includes('cycl')) return 'ride'
  return 'strength'
}

export function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.round(secs % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function epley1RM(weight_kg: number, reps: number): number {
  if (weight_kg <= 0 || reps <= 0) return 0
  return reps === 1 ? weight_kg : weight_kg * (1 + reps / 30)
}

function isRide(a: Activity) {
  const t = a.sport_type?.toLowerCase() ?? ''
  return t.includes('ride') || t.includes('cycl')
}

function isRun(a: Activity) {
  return a.sport_type?.toLowerCase().includes('run')
}

// ─── Computation ──────────────────────────────────────────────────────────────

export function computePerformanceScore(activities: Activity[], hevy: HevyWorkout[]) {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const recent14 = [
    ...activities.filter(a => a.start_date >= fourteenDaysAgo),
    ...hevy.filter(h => h.start_time >= fourteenDaysAgo),
  ]
  const consistency = Math.min(recent14.length / 6, 1)

  const kj7 = activities.filter(a => a.start_date >= sevenDaysAgo).reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const kj14to7 = activities.filter(a => a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo).reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const loadRatio = kj14to7 > 0 ? kj7 / kj14to7 : 1
  const loadScore = loadRatio > 1.4 ? 0.2 : loadRatio > 1.2 ? 0.7 : loadRatio > 0.7 ? 1 : 0.5

  const recentRuns = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo && a.average_speed)
  const olderRuns = activities.filter(a => isRun(a) && a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo && a.average_speed)
  const avgSpd = (arr: Activity[]) => arr.reduce((s, a) => s + (a.average_speed ?? 0), 0) / arr.length
  const trendScore = recentRuns.length > 0 && olderRuns.length > 0 && avgSpd(recentRuns) > avgSpd(olderRuns)
    ? 1 : recentRuns.length > 0 ? 0.6 : 0.5

  const score = Math.round(consistency * 40 + loadScore * 30 + trendScore * 30)
  const label = loadRatio > 1.4 ? 'Excessive Load' : score >= 75 ? 'Productive' : score >= 50 ? 'Maintaining' : 'Underperforming'
  const color = loadRatio > 1.4 ? '#f87171' : score >= 75 ? '#4ade80' : score >= 50 ? '#facc15' : '#fb923c'

  return { score, label, color, loadRatio }
}

function computeRunningReadiness(activities: Activity[]) {
  const runs = activities.filter(isRun).sort((a, b) => b.start_date.localeCompare(a.start_date))
  if (runs.length === 0) return { pct: 90, suggestion: 'Easy Run' }

  const hoursSince = (Date.now() - new Date(runs[0].start_date).getTime()) / 3600000
  let base = hoursSince < 12 ? 55 : hoursSince < 24 ? 70 : hoursSince < 48 ? 82 : 92

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const vol7 = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo).reduce((s, a) => s + (a.distance ?? 0), 0)
  const vol14to7 = activities.filter(a => isRun(a) && a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo).reduce((s, a) => s + (a.distance ?? 0), 0)
  if (vol14to7 > 0 && vol7 > vol14to7 * 1.3) base = Math.round(base * 0.85)

  const suggestion = base >= 85 ? 'Tempo Run' : base >= 70 ? 'Easy Run' : 'Rest Day'
  return { pct: base, suggestion }
}

function riegelPredict(baseDistM: number, baseTimeSec: number, targetDistM: number): number {
  return baseTimeSec * Math.pow(targetDistM / baseDistM, 1.06)
}

export function computeRaceProjections(activities: Activity[]) {
  const runs = activities.filter(a => isRun(a) && (a.distance ?? 0) >= 1000 && (a.moving_time ?? 0) > 0)
  if (runs.length === 0) return null

  const bestRun = runs.reduce((best, a) => {
    const spd = (a.distance ?? 0) / (a.moving_time ?? 1)
    return spd > (best.distance ?? 0) / (best.moving_time ?? 1) ? a : best
  }, runs[0])

  const d = bestRun.distance!
  const t = bestRun.moving_time!

  return {
    '5K': formatTime(riegelPredict(d, t, 5000)),
    '10K': formatTime(riegelPredict(d, t, 10000)),
    'Half': formatTime(riegelPredict(d, t, 21097)),
    'Marathon': formatTime(riegelPredict(d, t, 42195)),
  }
}

function computeRunningEfficiencyTrend(activities: Activity[]): string {
  const now = Date.now()
  const fifteenDaysAgo = new Date(now - 15 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString()
  const runs = activities.filter(isRun)

  const earlyRuns = runs.filter(a => a.start_date >= thirtyDaysAgo && a.start_date < fifteenDaysAgo)
  const lateRuns = runs.filter(a => a.start_date >= fifteenDaysAgo)

  const avgCad = (arr: Activity[]) => {
    const valid = arr.filter(a => a.average_cadence)
    return valid.length ? valid.reduce((s, a) => s + (a.average_cadence ?? 0), 0) / valid.length * 2 : 0
  }
  const earlyCad = avgCad(earlyRuns)
  const lateCad = avgCad(lateRuns)
  if (earlyCad > 0 && lateCad > 0) {
    const diff = Math.round(lateCad - earlyCad)
    if (diff > 2) return `Cadence improving ↑ +${diff} spm vs 2 weeks ago`
    if (diff < -2) return `Cadence declining ↓ ${Math.abs(diff)} spm vs 2 weeks ago`
  }

  const avgSpd = (arr: Activity[]) => {
    const valid = arr.filter(a => a.average_speed)
    return valid.length ? valid.reduce((s, a) => s + (a.average_speed ?? 0), 0) / valid.length : 0
  }
  const earlySpd = avgSpd(earlyRuns)
  const lateSpd = avgSpd(lateRuns)
  if (earlySpd > 0 && lateSpd > 0) {
    const pct = ((lateSpd - earlySpd) / earlySpd) * 100
    if (pct > 2) return `Pace improving ↑ +${pct.toFixed(1)}% vs 2 weeks ago`
    if (pct < -2) return `Pace declining ↓ ${Math.abs(pct).toFixed(1)}% vs 2 weeks ago`
  }

  return 'Efficiency stable over last 30 days'
}

export function computeFTP(activities: Activity[]): number | null {
  const rides = activities.filter(a => isRide(a) && (a.kilojoules ?? 0) > 0 && (a.moving_time ?? 0) > 2700)
  if (rides.length === 0) return null
  const maxAvgWatts = Math.max(...rides.map(a => (a.kilojoules! * 1000) / a.moving_time!))
  return Math.round(maxAvgWatts * 0.95)
}

function computeCyclingEnduranceTrend(activities: Activity[]): number | null {
  const now = Date.now()
  const fifteenDaysAgo = new Date(now - 15 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString()

  const earlyRides = activities.filter(a => isRide(a) && a.start_date >= thirtyDaysAgo && a.start_date < fifteenDaysAgo && a.average_speed)
  const lateRides = activities.filter(a => isRide(a) && a.start_date >= fifteenDaysAgo && a.average_speed)
  if (earlyRides.length === 0 || lateRides.length === 0) return null

  const earlyAvg = earlyRides.reduce((s, a) => s + (a.average_speed ?? 0), 0) / earlyRides.length
  const lateAvg = lateRides.reduce((s, a) => s + (a.average_speed ?? 0), 0) / lateRides.length
  return ((lateAvg - earlyAvg) / earlyAvg) * 100
}

function computeCyclingReadiness(activities: Activity[]) {
  const rides = activities.filter(isRide).sort((a, b) => b.start_date.localeCompare(a.start_date))
  if (rides.length === 0) return { pct: 90, suggestion: 'Zone 2' }
  const hoursSince = (Date.now() - new Date(rides[0].start_date).getTime()) / 3600000
  const base = hoursSince < 12 ? 55 : hoursSince < 24 ? 70 : hoursSince < 48 ? 82 : 92
  const suggestion = base >= 85 ? 'Threshold Session' : base >= 70 ? 'Zone 2' : 'Recovery Ride'
  return { pct: base, suggestion }
}

export function extractKeyLifts(hevy: HevyWorkout[]) {
  const liftDefs = [
    { name: 'Squat', keywords: ['squat'], color: 'text-teal-400' },
    { name: 'Bench Press', keywords: ['bench'], color: 'text-blue-400' },
    { name: 'Deadlift', keywords: ['deadlift', 'rdl'], color: 'text-cyan-400' },
    { name: 'Overhead Press', keywords: ['overhead press', 'ohp', 'shoulder press', 'military press'], color: 'text-yellow-400' },
    { name: 'Pull-Up', keywords: ['pull-up', 'pullup', 'pull up', 'chin-up', 'chinup', 'chin up'], color: 'text-orange-400' },
  ]

  const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString()

  return liftDefs.map(({ name, keywords, color }) => {
    const history: { time: string; max1RM: number }[] = []
    hevy.forEach(w => {
      if (!w.exercises) return
      w.exercises.forEach(ex => {
        const title = ex.title.toLowerCase()
        if (!keywords.some(k => title.includes(k))) return
        if (!ex.sets?.length) return
        const max1RM = Math.max(...ex.sets.map(s => epley1RM(s.weight_kg, s.reps)))
        if (max1RM > 0) history.push({ time: w.start_time, max1RM })
      })
    })
    if (history.length === 0) return null

    const current1RM = Math.round(Math.max(...history.map(h => h.max1RM)))
    const early = history.filter(m => m.time < fifteenDaysAgo)
    const late = history.filter(m => m.time >= fifteenDaysAgo)
    const earlyMax = early.length ? Math.max(...early.map(m => m.max1RM)) : 0
    const lateMax = late.length ? Math.max(...late.map(m => m.max1RM)) : 0

    let trend = 'Stable'
    if (earlyMax > 0 && lateMax > 0) {
      const diff = lateMax - earlyMax
      if (diff > 2.5) trend = `↑ ${diff.toFixed(1)} kg`
      else if (diff < -2.5) trend = `↓ ${Math.abs(diff).toFixed(1)} kg`
    }
    return { name, current1RM, trend, color }
  }).filter((l): l is NonNullable<typeof l> => l !== null)
}

export function computeMuscleRecovery(hevy: HevyWorkout[]) {
  const groups = [
    { label: 'Legs', keywords: ['squat', 'deadlift', 'leg press', 'lunge', 'rdl', 'hip thrust', 'calf', 'hamstring', 'quad', 'leg curl', 'leg extension'] },
    { label: 'Chest', keywords: ['bench', 'push', 'fly', 'dip', 'chest'] },
    { label: 'Back', keywords: ['row', 'pull-up', 'pullup', 'lat', 'deadlift', 'chin', 'cable row'] },
    { label: 'Shoulders', keywords: ['lateral raise', 'front raise', 'shoulder', 'overhead press', 'ohp', 'military press', 'upright row'] },
    { label: 'Arms', keywords: ['curl', 'tricep', 'extension', 'hammer', 'bicep', 'preacher'] },
  ]

  const sorted = [...hevy].sort((a, b) => b.start_time.localeCompare(a.start_time))

  return groups.map(({ label, keywords }) => {
    let lastTrained: string | null = null
    for (const w of sorted) {
      if (!w.exercises) continue
      if (w.exercises.some(ex => keywords.some(k => ex.title.toLowerCase().includes(k)))) {
        lastTrained = w.start_time
        break
      }
    }
    if (!lastTrained) return { label, recovery: 100 }
    const hoursSince = (Date.now() - new Date(lastTrained).getTime()) / 3600000
    const recovery = hoursSince < 24 ? 20 : hoursSince < 48 ? 55 : hoursSince < 72 ? 80 : 100
    return { label, recovery }
  })
}

export function estimateVO2max(activities: Activity[]): number | null {
  const runs = activities.filter(a => isRun(a) && (a.distance ?? 0) >= 2000 && (a.moving_time ?? 0) > 240)
  if (runs.length === 0) return null

  let best = 0
  for (const run of runs) {
    const v = (run.distance! / run.moving_time!) * 60 // m/min
    const t = run.moving_time! / 60 // minutes
    const pctVO2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)
    const oc = -4.60 + 0.182258 * v + 0.000104 * v * v
    const vo2 = oc / pctVO2max
    if (vo2 > best) best = vo2
  }
  return best > 20 ? Math.round(best) : null
}

// ─── AI Insight builders ──────────────────────────────────────────────────────

function buildOverviewInsight(activities: Activity[], hevy: HevyWorkout[]): string {
  const { score, label } = computePerformanceScore(activities, hevy)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const weekRuns = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo).length
  const weekStrength = hevy.filter(h => h.start_time >= sevenDaysAgo).length
  const parts: string[] = []
  if (weekRuns > 0) parts.push(`${weekRuns} run${weekRuns > 1 ? 's' : ''}`)
  if (weekStrength > 0) parts.push(`${weekStrength} strength session${weekStrength > 1 ? 's' : ''}`)
  const prefix = parts.length > 0 ? parts.join(' and ') + ' this week. ' : ''
  return `${prefix}Performance score ${score}/100 — ${label.toLowerCase()}.`
}

function buildRunningInsight(activities: Activity[]): string {
  const runs = activities.filter(isRun)
  if (runs.length === 0) return 'No running data in the last 30 days.'
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const vol7 = runs.filter(a => a.start_date >= sevenDaysAgo).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const vol14to7 = runs.filter(a => a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const readiness = computeRunningReadiness(activities)
  if (vol14to7 > 0) {
    const pct = Math.round((vol7 - vol14to7) / vol14to7 * 100)
    const dir = pct > 5 ? `up ${pct}%` : pct < -5 ? `down ${Math.abs(pct)}%` : 'similar'
    return `Running volume ${dir} vs last week (${vol7.toFixed(1)} km). Recovery at ${readiness.pct}% — ${readiness.suggestion.toLowerCase()} recommended.`
  }
  return `${vol7.toFixed(1)} km logged this week. Recovery at ${readiness.pct}% — ${readiness.suggestion.toLowerCase()} recommended.`
}

function buildCyclingInsight(activities: Activity[]): string {
  if (!activities.some(isRide)) return 'No cycling data in the last 30 days.'
  const ftp = computeFTP(activities)
  const trend = computeCyclingEnduranceTrend(activities)
  const readiness = computeCyclingReadiness(activities)
  const parts: string[] = []
  if (ftp) parts.push(`Estimated FTP ${ftp}W`)
  if (trend !== null) parts.push(`endurance ${trend > 0 ? `+${trend.toFixed(0)}%` : `${trend.toFixed(0)}%`} over 4 weeks`)
  parts.push(`${readiness.suggestion.toLowerCase()} recommended today`)
  return parts.join('. ') + '.'
}

function buildStrengthInsight(hevy: HevyWorkout[]): string {
  if (hevy.length === 0) return 'No strength data in the last 30 days.'
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const weekSessions = hevy.filter(h => h.start_time >= sevenDaysAgo).length
  const weekVolume = hevy.filter(h => h.start_time >= sevenDaysAgo).reduce((s, h) => s + (h.volume_kg ?? 0), 0)
  const lifts = extractKeyLifts(hevy)
  const trending = lifts.find(l => l.trend.includes('↑'))
  let text = `${weekSessions} strength session${weekSessions !== 1 ? 's' : ''} this week.`
  if (trending) text += ` ${trending.name} progressing (${trending.trend}).`
  if (weekVolume > 0) text += ` ${Math.round(weekVolume).toLocaleString('nl-NL')} kg total load.`
  return text
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

export function AiInsight({ text }: { text: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-orange-400 text-[14px]">✦</span>
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">AI Insight</span>
        </div>
        <p className="text-[17px] text-white/85 leading-relaxed">{text}</p>
      </div>
    </Card>
  )
}

export function SmallCard({ title, value, unit = '', detail, Icon, tint, onClick }: {
  title: string; value: string; unit?: string; detail: string
  Icon: React.ElementType; tint: string; onClick?: () => void
}) {
  return (
    <Card className="flex-1" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="flex flex-col gap-2.5">
        <Icon size={16} className={tint} />
        <div className="flex items-baseline gap-[3px]">
          <span className="text-[24px] font-bold text-white leading-none">{value}</span>
          {unit && <span className="text-[13px] font-semibold text-white/50">{unit}</span>}
        </div>
        <span className="text-[15px] text-white/50">{title}</span>
        <span className={`text-[12px] ${tint} opacity-80`}>{detail}</span>
      </div>
    </Card>
  )
}

export function ZoneBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-white/70">{label}</span>
        <span className="text-[13px] font-semibold" style={{ color }}>{Math.round(percent * 100)}%</span>
      </div>
      <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${percent * 100}%`, background: color }} />
      </div>
    </div>
  )
}

function PredictiveCard({ title, value, label, context, dotColor }: {
  title: string; value: string; label: string; context: string; dotColor: string
}) {
  return (
    <Card className="flex-1">
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">{title}</span>
        <span className="text-[28px] font-bold text-white leading-none">{value}</span>
        <div className="flex items-center gap-1.5">
          <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: dotColor }} />
          <span className="text-[13px] font-semibold text-white">{label}</span>
        </div>
        <span className="text-[12px] text-white/40 leading-snug">{context}</span>
      </div>
    </Card>
  )
}

function ReadinessCard({ pct, suggestion, sport }: { pct: number; suggestion: string; sport: string }) {
  const color = pct >= 85 ? '#4ade80' : pct >= 70 ? '#facc15' : '#fb923c'
  const r = 22
  const circumference = 2 * Math.PI * r
  const dash = circumference * pct / 100
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="relative w-[60px] h-[60px] shrink-0">
          <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
            <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
            <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5"
              strokeDasharray={`${dash} ${circumference - dash}`} strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-white leading-none">
            {pct}%
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[17px] font-bold text-white">{sport} Readiness</span>
          <span className="text-[15px] text-white/50">{suggestion}</span>
        </div>
      </div>
    </Card>
  )
}

function MuscleRecoveryBar({ label, recovery }: { label: string; recovery: number }) {
  const recColor = recovery >= 80 ? '#4ade80' : recovery >= 50 ? '#facc15' : '#f87171'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] text-white">{label}</span>
        <span className="text-[13px] font-semibold" style={{ color: recColor }}>{recovery}%</span>
      </div>
      <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${recovery}%`, background: recColor }} />
      </div>
    </div>
  )
}

// ─── Activity detail sheet ────────────────────────────────────────────────────

type DetailRow = { label: string; value: string; sub?: string }

function ActivityDetailSheet({ title, rows, onClose }: { title: string; rows: DetailRow[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative flex flex-col max-h-[80vh] rounded-t-[24px] overflow-hidden"
        style={{ background: 'rgb(10,12,14)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <span className="text-[17px] font-bold text-white">{title}</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X size={16} className="text-white/70" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-8 flex flex-col gap-1">
          {rows.length === 0 ? (
            <p className="text-white/30 text-[15px] text-center py-8">No data available</p>
          ) : rows.map((row, i) => (
            <div key={i} className="flex items-center justify-between py-3.5"
              style={{ borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div>
                <p className="text-[15px] font-medium text-white">{row.label}</p>
                {row.sub && <p className="text-[12px] text-white/40 mt-0.5">{row.sub}</p>}
              </div>
              <span className="text-[15px] font-semibold text-white/80 shrink-0 ml-4">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export function OverviewSection({ activities, hevy, calendarEvents, onRefresh, refreshing }: {
  activities: Activity[]; hevy: HevyWorkout[]; calendarEvents: any[]
  onRefresh?: () => void; refreshing?: boolean
}) {
  const perf = computePerformanceScore(activities, hevy)
  const weekStart = startOfWeek()
  const weekWorkouts = [
    ...activities.filter(a => a.start_date >= weekStart),
    ...hevy.filter(h => h.start_time >= weekStart),
  ].length

  const allTimes = [
    ...activities.map(a => a.start_date),
    ...hevy.map(h => h.start_time),
  ].sort().reverse()
  const lastWorkoutMs = allTimes.length > 0 ? new Date(allTimes[0]).getTime() : null
  const hoursSinceLast = lastWorkoutMs ? (Date.now() - lastWorkoutMs) / 3600000 : null
  const recoveryPct = hoursSinceLast !== null
    ? hoursSinceLast < 12 ? 45 : hoursSinceLast < 24 ? 65 : hoursSinceLast < 48 ? 82 : 95
    : 95

  const now = Date.now()
  const fifteenDaysAgo = new Date(now - 15 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString()
  const earlyKj = activities.filter(a => a.start_date >= thirtyDaysAgo && a.start_date < fifteenDaysAgo).reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const lateKj = activities.filter(a => a.start_date >= fifteenDaysAgo).reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const loadTrend = earlyKj > 0 ? Math.round((lateKj - earlyKj) / earlyKj * 100) : 0

  const upcoming = (calendarEvents ?? []).slice(0, 3).map((e: any) => {
    const dateStr = e.start_datetime || e.start_date
    const label = new Date(dateStr).toLocaleDateString('nl-NL', { weekday: 'short', month: 'short', day: 'numeric' })
    return `${label} · ${e.title}`
  })

  return (
    <div className="flex flex-col gap-[18px]">
      <AiInsight text={buildOverviewInsight(activities, hevy)} />

      <div className="grid grid-cols-2 gap-3">
        <PredictiveCard
          title="Performance Score"
          value={`${perf.score}`}
          label={perf.label}
          context="Consistency · load · trend"
          dotColor={perf.color}
        />
        <PredictiveCard
          title="This Week"
          value={`${weekWorkouts}/4`}
          label={weekWorkouts >= 4 ? 'On target' : weekWorkouts >= 2 ? 'In progress' : 'Getting started'}
          context="Sessions completed"
          dotColor={weekWorkouts >= 4 ? '#4ade80' : weekWorkouts >= 2 ? '#facc15' : '#fb923c'}
        />
        <PredictiveCard
          title="Recovery"
          value={`${recoveryPct}%`}
          label={recoveryPct >= 85 ? 'Ready to train' : recoveryPct >= 65 ? 'Recovering' : 'Rest needed'}
          context={hoursSinceLast !== null ? `Last workout ${Math.round(hoursSinceLast)}h ago` : 'No recent workout'}
          dotColor={recoveryPct >= 85 ? '#4ade80' : recoveryPct >= 65 ? '#facc15' : '#fb923c'}
        />
        <PredictiveCard
          title="Load Trend"
          value={earlyKj > 0 ? `${loadTrend > 0 ? '+' : ''}${loadTrend}%` : '–'}
          label={loadTrend > 15 ? 'Building fast' : loadTrend > 0 ? 'Building' : loadTrend < -15 ? 'Tapering' : 'Stable'}
          context="Last 15 vs prior 15 days"
          dotColor={loadTrend > 20 ? '#fb923c' : loadTrend > 0 ? '#4ade80' : '#60a5fa'}
        />
      </div>

      <MinimalWorkoutList
        title="Upcoming workouts"
        workouts={upcoming.length > 0 ? upcoming : ['–', '–', '–']}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
    </div>
  )
}

// ─── Running ──────────────────────────────────────────────────────────────────

export function RunningSection({ activities }: { activities: Activity[] }) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const weekRuns = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo)
  const weekKm = weekRuns.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const speedRuns = weekRuns.filter(a => a.average_speed)
  const avgSpeed = speedRuns.length ? speedRuns.reduce((s, a) => s + (a.average_speed ?? 0), 0) / speedRuns.length : 0
  const cadenceRuns = weekRuns.filter(a => a.average_cadence)
  const avgCadence = cadenceRuns.length ? Math.round(cadenceRuns.reduce((s, a) => s + (a.average_cadence ?? 0), 0) / cadenceRuns.length * 2) : 0

  const [sheet, setSheet] = useState<'distance' | 'pace' | null>(null)

  const projections = computeRaceProjections(activities)
  const readiness = computeRunningReadiness(activities)
  const efficiencyTrend = computeRunningEfficiencyTrend(activities)

  const allRuns = activities.filter(isRun)
  const distanceRows: DetailRow[] = allRuns.map(a => ({ label: a.name, sub: formatDate(a.start_date), value: a.distance ? `${(a.distance / 1000).toFixed(2)} km` : '–' }))
  const paceRows: DetailRow[] = allRuns.filter(a => a.average_speed).map(a => ({ label: a.name, sub: formatDate(a.start_date), value: `${formatPace(a.average_speed!)} /km` }))

  const prsData = [
    { dist: '5K', time: projections?.['5K'] ?? '–' },
    { dist: '10K', time: projections?.['10K'] ?? '–' },
    { dist: 'Half', time: projections?.['Half'] ?? '–' },
    { dist: 'Marathon', time: projections?.['Marathon'] ?? '–' },
  ]

  const paceZones = [
    { label: 'Easy', percent: 0, color: '#4ade80' },
    { label: 'Moderate', percent: 0, color: '#facc15' },
    { label: 'Tempo', percent: 0, color: '#fb923c' },
    { label: 'Threshold', percent: 0, color: '#f87171' },
    { label: 'Interval', percent: 0, color: '#f472b6' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={buildRunningInsight(activities)} />

      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-white/50">Race Projections</span>
            {projections && <span className="text-[12px] text-teal-400">Riegel formula</span>}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {prsData.map(pr => (
              <div key={pr.dist} className="flex flex-col items-center gap-1">
                <span className="text-[15px] font-bold text-white leading-tight text-center">{pr.time}</span>
                <span className="text-[11px] text-white/40">{pr.dist}</span>
                <span className={`text-[11px] font-medium ${projections ? 'text-teal-400' : 'text-white/30'}`}>
                  {projections ? 'Projected' : '–'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <ReadinessCard pct={readiness.pct} suggestion={readiness.suggestion} sport="Running" />

      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Weekly Distance" value={weekKm > 0 ? weekKm.toFixed(1) : '–'} unit="km" detail="Running" Icon={PersonStanding} tint="text-teal-400" onClick={() => setSheet('distance')} />
        <SmallCard title="Avg Pace" value={avgSpeed > 0 ? formatPace(avgSpeed) : '–'} unit="/km" detail="This week" Icon={TrendingUp} tint="text-blue-400" onClick={() => setSheet('pace')} />
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-white/50">Running Metrics</span>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Cadence', value: avgCadence > 0 ? `${avgCadence}` : '–', unit: 'spm', color: '#60a5fa' },
              { label: 'Stride', value: '–', unit: 'm', color: '#2dd4bf' },
              { label: 'Oscillation', value: '–', unit: 'cm', color: '#fb923c' },
              { label: 'GCT', value: '–', unit: 'ms', color: '#a78bfa' },
            ].map(m => (
              <div key={m.label} className="flex flex-col items-center gap-1">
                <span className="text-[22px] font-bold leading-none" style={{ color: m.color }}>{m.value}</span>
                <span className="text-[11px] text-white/40">{m.unit}</span>
                <span className="text-[11px] text-white/40">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="pt-1 border-t border-white/[0.06]">
            <span className="text-[13px] text-white/50">{efficiencyTrend}</span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold text-white/50">Pace Zones</span>
          {paceZones.map(z => <ZoneBar key={z.label} label={z.label} percent={z.percent} color={z.color} />)}
        </div>
      </Card>

      {sheet === 'distance' && <ActivityDetailSheet title="Distance per run" rows={distanceRows} onClose={() => setSheet(null)} />}
      {sheet === 'pace' && <ActivityDetailSheet title="Pace per run" rows={paceRows} onClose={() => setSheet(null)} />}
    </div>
  )
}

// ─── Cycling ──────────────────────────────────────────────────────────────────

export function CyclingSection({ activities }: { activities: Activity[] }) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const weekRides = activities.filter(a => isRide(a) && a.start_date >= sevenDaysAgo)
  const weekKm = weekRides.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const weekElev = weekRides.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)
  const weekSecs = weekRides.reduce((s, a) => s + (a.moving_time ?? 0), 0)
  const speedRides = weekRides.filter(a => a.average_speed)
  const avgSpeedMs = speedRides.length ? speedRides.reduce((s, a) => s + (a.average_speed ?? 0), 0) / speedRides.length : 0

  const ftp = computeFTP(activities)
  const enduranceTrend = computeCyclingEnduranceTrend(activities)
  const readiness = computeCyclingReadiness(activities)

  const [sheet, setSheet] = useState<'duration' | 'elevation' | 'speed' | null>(null)

  const allRides = activities.filter(isRide)
  const durationRows: DetailRow[] = allRides.map(a => ({ label: a.name, sub: formatDate(a.start_date), value: a.moving_time ? formatDuration(a.moving_time) : '–' }))
  const elevationRows: DetailRow[] = allRides.map(a => ({ label: a.name, sub: formatDate(a.start_date), value: a.total_elevation_gain ? `${Math.round(a.total_elevation_gain)} m` : '–' }))
  const speedRows: DetailRow[] = allRides.filter(a => a.average_speed).map(a => ({ label: a.name, sub: formatDate(a.start_date), value: `${(a.average_speed! * 3.6).toFixed(1)} km/h` }))

  const powerZones = [
    { label: 'Active Recovery', percent: 0, color: '#9ca3af' },
    { label: 'Endurance', percent: 0, color: '#4ade80' },
    { label: 'Tempo', percent: 0, color: '#facc15' },
    { label: 'Threshold', percent: 0, color: '#fb923c' },
    { label: 'VO₂ Max', percent: 0, color: '#f87171' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={buildCyclingInsight(activities)} />

      <div>
        <Bike size={22} className="text-cyan-400 mb-3" />
        <div className="flex items-baseline gap-2">
          <span className="text-[56px] font-bold text-white leading-none">{weekKm > 0 ? weekKm.toFixed(0) : '–'}</span>
          <span className="text-[20px] font-semibold text-white/50">km this week</span>
        </div>
        <span className="text-[15px] font-medium text-cyan-400">
          {weekKm > 0 ? `${weekRides.length} ride${weekRides.length > 1 ? 's' : ''}` : '–'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Duration" value={weekSecs > 0 ? formatDuration(weekSecs) : '–'} detail="This week" Icon={Timer} tint="text-blue-400" onClick={() => setSheet('duration')} />
        <SmallCard title="Elevation" value={weekElev > 0 ? `${Math.round(weekElev).toLocaleString('nl-NL')}` : '–'} unit="m" detail="Climbing" Icon={TrendingUp} tint="text-orange-400" onClick={() => setSheet('elevation')} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Avg Speed" value={avgSpeedMs > 0 ? (avgSpeedMs * 3.6).toFixed(1) : '–'} unit="km/h" detail="This week" Icon={TrendingUp} tint="text-yellow-400" onClick={() => setSheet('speed')} />
        <SmallCard title="Est. FTP" value={ftp ? `${ftp}` : '–'} unit={ftp ? 'W' : ''} detail={ftp ? 'kJ-based estimate' : 'Need 45min+ rides'} Icon={Bike} tint="text-purple-400" />
      </div>

      {enduranceTrend !== null && (
        <Card>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-white/50">Endurance Trend</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-[28px] font-bold ${enduranceTrend >= 0 ? 'text-teal-400' : 'text-red-400'}`}>
                {enduranceTrend > 0 ? '+' : ''}{enduranceTrend.toFixed(1)}%
              </span>
              <span className="text-[15px] text-white/50">avg speed over 4 weeks</span>
            </div>
            <span className="text-[13px] text-white/40">
              {enduranceTrend >= 0 ? 'Fitness improving' : 'Fitness declining'} vs first half of 30-day window
            </span>
          </div>
        </Card>
      )}

      <ReadinessCard pct={readiness.pct} suggestion={readiness.suggestion} sport="Cycling" />

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-white/50">Power Distribution</span>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Avg Power', value: '–', unit: 'W', color: '#22d3ee' },
              { label: 'Normalized', value: '–', unit: 'W', color: '#60a5fa' },
              { label: 'Max 5s', value: '–', unit: 'W', color: '#fb923c' },
              { label: 'Max 20m', value: '–', unit: 'W', color: '#a78bfa' },
            ].map(m => (
              <div key={m.label} className="flex flex-col items-center gap-1">
                <span className="text-[18px] font-bold" style={{ color: m.color }}>{m.value}</span>
                <span className="text-[11px] text-white/40">{m.unit}</span>
                <span className="text-[10px] text-white/30 text-center leading-tight">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {powerZones.map(z => <ZoneBar key={z.label} label={z.label} percent={z.percent} color={z.color} />)}
          </div>
        </div>
      </Card>

      {sheet === 'duration' && <ActivityDetailSheet title="Duration per ride" rows={durationRows} onClose={() => setSheet(null)} />}
      {sheet === 'elevation' && <ActivityDetailSheet title="Elevation per ride" rows={elevationRows} onClose={() => setSheet(null)} />}
      {sheet === 'speed' && <ActivityDetailSheet title="Avg speed per ride" rows={speedRows} onClose={() => setSheet(null)} />}
    </div>
  )
}

// ─── Strength ─────────────────────────────────────────────────────────────────

export function StrengthSection({ hevy }: { hevy: HevyWorkout[] }) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const weekHevy = hevy.filter(h => h.start_time >= sevenDaysAgo)
  const totalSets = weekHevy.reduce((s, h) => s + (h.sets ?? 0), 0)
  const totalVolume = weekHevy.reduce((s, h) => s + (h.volume_kg ?? 0), 0)

  const keyLifts = extractKeyLifts(hevy)
  const muscleRecovery = computeMuscleRecovery(hevy)

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={buildStrengthInsight(hevy)} />

      <div>
        <Dumbbell size={22} className="text-orange-400 mb-3" />
        <div className="flex items-baseline gap-2">
          <span className="text-[56px] font-bold text-white leading-none">{totalSets || '–'}</span>
          <span className="text-[20px] font-semibold text-white/50">sets this week</span>
        </div>
        <span className="text-[15px] font-medium text-orange-400">
          {totalVolume > 0 ? `${Math.round(totalVolume).toLocaleString('nl-NL')} kg volume` : '–'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Volume Load" value={totalVolume > 0 ? Math.round(totalVolume).toLocaleString('nl-NL') : '–'} unit="kg" detail="Total lifted" Icon={TrendingUp} tint="text-orange-400" />
        <SmallCard title="Sessions" value={weekHevy.length > 0 ? `${weekHevy.length}` : '–'} detail={weekHevy.length > 0 ? 'of 4 planned' : '–'} Icon={Timer} tint="text-blue-400" />
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-white/50">Muscle Recovery</span>
          {muscleRecovery.map(g => (
            <MuscleRecoveryBar key={g.label} label={g.label} recovery={g.recovery} />
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold text-white/50">Key Lifts · Est. 1RM</span>
          {keyLifts.length > 0 ? keyLifts.map(l => (
            <div key={l.name} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }} />
              <div className="flex-1">
                <p className="text-[15px] font-medium text-white">{l.name}</p>
                <p className="text-[12px] text-white/40">{l.current1RM} kg estimated 1RM</p>
              </div>
              <span className={`text-[13px] font-semibold ${l.color}`}>{l.trend}</span>
            </div>
          )) : (
            <p className="text-white/30 text-[15px]">No matching exercises in Hevy data</p>
          )}
        </div>
      </Card>
    </div>
  )
}

// ─── History ──────────────────────────────────────────────────────────────────

function WorkoutIcon({ type }: { type: 'run' | 'ride' | 'strength' }) {
  if (type === 'run') return <PersonStanding size={16} className="text-teal-400" />
  if (type === 'ride') return <Bike size={16} className="text-cyan-400" />
  return <Dumbbell size={16} className="text-orange-400" />
}

export function HistorySection({ activities, hevy }: { activities: Activity[]; hevy: HevyWorkout[] }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const now = new Date()
  const displayMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const monthName = displayMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const daysInMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0).getDate()
  const firstDayOfWeek = (new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1).getDay() + 6) % 7
  const todayDay = now.getMonth() === displayMonth.getMonth() && now.getFullYear() === displayMonth.getFullYear() ? now.getDate() : -1

  const inMonth = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.getFullYear() === displayMonth.getFullYear() && d.getMonth() === displayMonth.getMonth()
  }

  const workoutDays = new Map<number, ('run' | 'ride' | 'strength')[]>()
  activities.forEach(a => {
    if (!inMonth(a.start_date)) return
    const day = new Date(a.start_date).getDate()
    workoutDays.set(day, [...(workoutDays.get(day) ?? []), sportIcon(a.sport_type)])
  })
  hevy.forEach(h => {
    if (!inMonth(h.start_time)) return
    const day = new Date(h.start_time).getDate()
    workoutDays.set(day, [...(workoutDays.get(day) ?? []), 'strength'])
  })

  const allRecent = [
    ...activities.map(a => ({ date: a.start_date, label: a.name, duration: a.moving_time ? formatDuration(a.moving_time) : '–', type: sportIcon(a.sport_type) as 'run' | 'ride' | 'strength', relDate: relativeDay(a.start_date) })),
    ...hevy.map(h => ({ date: h.start_time, label: h.title ?? 'Strength', duration: h.duration ? formatDuration(h.duration) : '–', type: 'strength' as const, relDate: relativeDay(h.start_time) })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

  const monthActivities = activities.filter(a => inMonth(a.start_date))
  const monthHevy = hevy.filter(h => inMonth(h.start_time))
  const monthKm = monthActivities.filter(isRun).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const monthSecs = [...monthActivities, ...monthHevy].reduce((s, a: any) => s + (a.moving_time ?? a.duration ?? 0), 0)
  const monthKcal = monthActivities.reduce((s, a) => s + ((a.kilojoules ?? 0) * 0.239), 0)
  const monthTotal = monthActivities.length + monthHevy.length
  const consistencyPct = Math.round((monthTotal / daysInMonth) * 7)

  const monthInsight = monthTotal === 0
    ? `No workouts logged in ${displayMonth.toLocaleDateString('en-US', { month: 'long' })}.`
    : `${monthTotal} workout${monthTotal > 1 ? 's' : ''} in ${displayMonth.toLocaleDateString('en-US', { month: 'long' })}, averaging ${(monthTotal / (daysInMonth / 7)).toFixed(1)} per week.${monthKm > 0 ? ` Running: ${monthKm.toFixed(0)} km.` : ''}`

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={monthInsight} />

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <button onClick={() => setMonthOffset(o => o - 1)} className="w-8 h-8 flex items-center justify-center">
              <ChevronLeft size={18} className="text-white/50" />
            </button>
            <span className="text-[17px] font-bold text-white">{monthName}</span>
            <button onClick={() => setMonthOffset(o => o + 1)} className="w-8 h-8 flex items-center justify-center">
              <ChevronRight size={18} className="text-white/50" />
            </button>
          </div>
          <div className="grid grid-cols-7">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[12px] font-semibold text-white/40 pb-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} className="h-[44px]" />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const isToday = day === todayDay
              const hasWorkout = workoutDays.has(day)
              const showCircle = isToday || hasWorkout
              return (
                <div key={day} className="h-[44px] flex flex-col items-center justify-center gap-[3px]">
                  <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center"
                    style={showCircle ? { background: 'white' } : {}}>
                    <span className="text-[14px] leading-none"
                      style={{ fontWeight: showCircle ? 700 : 400, color: showCircle ? 'black' : 'rgba(255,255,255,0.75)' }}>
                      {day}
                    </span>
                  </div>
                  {hasWorkout && isToday && <div className="w-[5px] h-[5px] rounded-full bg-black" />}
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <SectionHeader title="Recent Workouts" detail="Last 7 days" />
          {allRecent.length === 0 ? (
            <p className="text-white/40 text-[15px]">No workouts found</p>
          ) : allRecent.map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.07)' }}>
                <WorkoutIcon type={w.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-white truncate">{w.label}</p>
                <p className="text-[12px] text-white/40">{w.relDate}</p>
              </div>
              <span className="text-[13px] text-white/40 shrink-0">{w.duration}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <SectionHeader
            title={`${displayMonth.toLocaleDateString('en-US', { month: 'long' })} Summary`}
            detail={`${daysInMonth} days`}
          />
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Workouts', value: `${monthTotal}`, color: 'text-teal-400' },
              { label: 'Consistency', value: monthTotal > 0 ? `${consistencyPct}%` : '–', color: 'text-blue-400' },
              { label: 'Duration', value: monthSecs > 0 ? formatDuration(monthSecs) : '–', color: 'text-orange-400' },
              { label: 'Calories', value: monthKcal > 0 ? `${(monthKcal / 1000).toFixed(1)}K` : '–', color: 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <span className={`text-[17px] font-bold ${s.color}`}>{s.value}</span>
                <span className="text-[11px] text-white/40">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

function relativeDay(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
}
