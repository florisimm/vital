'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { TrendingUp, Timer, Dumbbell, Bike, PersonStanding, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Card, SectionHeader } from '@/components/ui'

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
  // Unified status vocabulary used everywhere in the Training section
  const label = loadRatio > 1.4 ? 'Overreaching' : score >= 75 ? 'Productive' : score >= 50 ? 'Maintaining' : 'Recovering'
  const color = loadRatio > 1.4 ? '#f87171' : score >= 75 ? '#4ade80' : score >= 50 ? '#facc15' : '#fb923c'

  return {
    score, label, color, loadRatio,
    breakdown: {
      consistency: Math.round(consistency * 100),
      loadBalance: Math.round(loadScore * 100),
      trend: Math.round(trendScore * 100),
    },
  }
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
        const title = (ex.title ?? '').toLowerCase()
        if (!keywords.some(k => title.includes(k))) return
        if (!ex.sets?.length) return
        const max1RM = Math.max(...ex.sets.map(s => epley1RM(s.weight_kg ?? 0, s.reps ?? 0)))
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
      if (w.exercises.some(ex => keywords.some(k => (ex.title ?? '').toLowerCase().includes(k)))) {
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

function computeRunning7DayTrend(activities: Activity[]) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const runs7 = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo)
  const runs14to7 = activities.filter(a => isRun(a) && a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo)
  const vol7 = runs7.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const vol14to7 = runs14to7.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const volPct = vol14to7 > 0 ? Math.round((vol7 - vol14to7) / vol14to7 * 100) : null
  const speedRuns7 = runs7.filter(a => a.average_speed)
  const avgSpd7 = speedRuns7.length ? speedRuns7.reduce((s, a) => s + (a.average_speed ?? 0), 0) / speedRuns7.length : 0
  const speedRuns14to7 = runs14to7.filter(a => a.average_speed)
  const avgSpd14to7 = speedRuns14to7.length ? speedRuns14to7.reduce((s, a) => s + (a.average_speed ?? 0), 0) / speedRuns14to7.length : 0
  const avgPace7 = avgSpd7 > 0 ? formatPace(avgSpd7) : null
  const paceDir = avgSpd7 > 0 && avgSpd14to7 > 0
    ? (avgSpd7 > avgSpd14to7 * 1.02 ? 'sneller' : avgSpd7 < avgSpd14to7 * 0.98 ? 'langzamer' : 'stabiel')
    : null
  return { vol7, volPct, avgPace7, paceDir, runs7: runs7.length, runs14to7: runs14to7.length }
}

function computeCyclingWeeklyTrend(activities: Activity[]) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const rides7 = activities.filter(a => isRide(a) && a.start_date >= sevenDaysAgo)
  const rides14to7 = activities.filter(a => isRide(a) && a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo)
  const km7 = rides7.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const km14to7 = rides14to7.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const kmPct = km14to7 > 0 ? Math.round((km7 - km14to7) / km14to7 * 100) : null
  const elev7 = rides7.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)
  const dur7 = rides7.reduce((s, a) => s + (a.moving_time ?? 0), 0)
  return { km7, elev7, dur7, kmPct, rideCount: rides7.length }
}

function computeStrengthProgress(hevy: HevyWorkout[]) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const hevy7 = hevy.filter(h => h.start_time >= sevenDaysAgo)
  const hevy14to7 = hevy.filter(h => h.start_time >= fourteenDaysAgo && h.start_time < sevenDaysAgo)
  const vol7 = hevy7.reduce((s, h) => s + (h.volume_kg ?? 0), 0)
  const vol14to7 = hevy14to7.reduce((s, h) => s + (h.volume_kg ?? 0), 0)
  const sets7 = hevy7.reduce((s, h) => s + (h.sets ?? 0), 0)
  const sets14to7 = hevy14to7.reduce((s, h) => s + (h.sets ?? 0), 0)
  const sessions7 = hevy7.length
  const sessions14to7 = hevy14to7.length
  const pctDelta = (cur: number, prev: number) => prev > 0 ? Math.round((cur - prev) / prev * 100) : null
  return {
    vol7, sets7, sessions7,
    volumePct: pctDelta(vol7, vol14to7),
    setsPct: pctDelta(sets7, sets14to7),
    sessionsPct: pctDelta(sessions7, sessions14to7),
  }
}

function computeMuscleDistribution(hevy: HevyWorkout[]) {
  const groups = [
    { label: 'Benen', keywords: ['squat', 'deadlift', 'leg press', 'lunge', 'rdl', 'hip thrust', 'calf', 'hamstring', 'quad', 'leg curl', 'leg extension'], color: '#4ade80' },
    { label: 'Borst', keywords: ['bench', 'push', 'fly', 'dip', 'chest'], color: '#60a5fa' },
    { label: 'Rug', keywords: ['row', 'pull-up', 'pullup', 'lat', 'deadlift', 'chin', 'cable row'], color: '#2dd4bf' },
    { label: 'Schouders', keywords: ['lateral raise', 'front raise', 'shoulder', 'overhead press', 'ohp', 'military press', 'upright row'], color: '#facc15' },
    { label: 'Armen', keywords: ['curl', 'tricep', 'extension', 'hammer', 'bicep', 'preacher'], color: '#fb923c' },
  ]
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const recentHevy = hevy.filter(h => h.start_time >= sevenDaysAgo)
  const setCounts: Record<string, number> = {}
  let totalSets = 0
  recentHevy.forEach(w => {
    if (!w.exercises) return
    w.exercises.forEach(ex => {
      const title = (ex.title ?? '').toLowerCase()
      const sets = ex.sets?.length ?? 0
      for (const g of groups) {
        if (g.keywords.some(k => title.includes(k))) {
          setCounts[g.label] = (setCounts[g.label] ?? 0) + sets
          totalSets += sets
          break
        }
      }
    })
  })
  if (totalSets === 0) return []
  return groups
    .filter(g => setCounts[g.label] > 0)
    .map(g => ({ label: g.label, pct: Math.round((setCounts[g.label] / totalSets) * 100), color: g.color }))
    .sort((a, b) => b.pct - a.pct)
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
  if (runs.length === 0) return 'Nog geen loopdata beschikbaar. Voeg je eerste run toe om inzichten te zien.'
  const readiness = computeRunningReadiness(activities)
  const trend = computeRunning7DayTrend(activities)
  const suggestion = readiness.suggestion === 'Tempo Run' ? 'een tempoloop'
    : readiness.suggestion === 'Easy Run' ? 'een rustige duurloop'
    : 'een rustdag'
  if (trend.volPct !== null && Math.abs(trend.volPct) >= 15) {
    const dir = trend.volPct > 0 ? `${trend.volPct}% meer km dan vorige week` : `${Math.abs(trend.volPct)}% minder km dan vorige week`
    return `Je loopt ${dir}. Herstel is ${readiness.pct}% — ${suggestion} aanbevolen vandaag.`
  }
  const kmPart = trend.vol7 > 0 ? `${trend.vol7.toFixed(1)} km deze week` : ''
  const pacePart = trend.avgPace7 ? ` in gemiddeld ${trend.avgPace7}/km` : ''
  return `Herstel op ${readiness.pct}%.${kmPart ? ` ${kmPart}${pacePart}.` : ''} Advies vandaag: ${suggestion}.`
}

function buildCyclingInsight(activities: Activity[]): string {
  if (!activities.some(isRide)) return 'Nog geen fietsdata beschikbaar. Koppel Strava voor automatische sync.'
  const readiness = computeCyclingReadiness(activities)
  const trend = computeCyclingWeeklyTrend(activities)
  const ftp = computeFTP(activities)
  const suggestion = readiness.suggestion === 'Threshold Session' ? 'een drempeltraining'
    : readiness.suggestion === 'Zone 2' ? 'een zone 2 duurrit'
    : 'een herstelrit'
  let text = `Herstel op ${readiness.pct}% — ${suggestion} aanbevolen vandaag.`
  if (trend.km7 > 0) text = `${trend.km7.toFixed(0)} km gefietst deze week. ` + text
  if (ftp) text += ` Geschatte FTP: ${ftp}W.`
  return text
}

function buildStrengthInsight(hevy: HevyWorkout[]): string {
  if (hevy.length === 0) return 'Nog geen krachtdata beschikbaar. Koppel Hevy voor automatische sync.'
  const progress = computeStrengthProgress(hevy)
  if (progress.sessions7 === 0) return 'Geen krachttraining deze week. Plan een sessie om je voortgang bij te houden.'
  const lifts = extractKeyLifts(hevy)
  const trending = lifts.find(l => l.trend.includes('↑'))
  let text = `${progress.sessions7} sessie${progress.sessions7 !== 1 ? 's' : ''} deze week`
  if (progress.vol7 > 0) text += ` met ${Math.round(progress.vol7).toLocaleString('nl-NL')} kg totaal volume`
  if (trending) text += `. ${trending.name} is in progressie (${trending.trend})`
  text += '.'
  const allRecovery = computeMuscleRecovery(hevy)
  const stillRecovering = allRecovery.filter(g => g.recovery < 60)
  if (stillRecovering.length > 0) {
    text += ` Let op: ${stillRecovering.map(g => g.label.toLowerCase()).join(', ')} nog aan het herstellen.`
  }
  return text
}

type InsightBadge = { emoji: string; text: string }

function buildTopInsights(
  activities: Activity[],
  hevy: HevyWorkout[],
  gezondheid: { datum: string; stappen: number; gewicht: number }[] | null,
  foodData: { foodLog: any[]; targets: any } | null
): InsightBadge[] {
  const badges: InsightBadge[] = []
  const today = new Date().toISOString().split('T')[0]
  const weekStart = startOfWeek()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  const { score, loadRatio } = computePerformanceScore(activities, hevy)

  // Running volume change week-over-week
  const vol7 = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const vol14to7 = activities.filter(a => isRun(a) && a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  if (vol14to7 > 0 && vol7 > 0) {
    const pct = Math.round((vol7 - vol14to7) / vol14to7 * 100)
    if (Math.abs(pct) >= 20) {
      badges.push(pct > 0 ? { emoji: '📈', text: `Loopvolume +${pct}%` } : { emoji: '📉', text: `Loopvolume -${Math.abs(pct)}%` })
    }
  }

  // Consistency
  const recent14 = [...activities.filter(a => a.start_date >= fourteenDaysAgo), ...hevy.filter(h => h.start_time >= fourteenDaysAgo)]
  const consistencyPct = Math.min(Math.round((recent14.length / 6) * 100), 100)
  if (consistencyPct === 100 && badges.length < 3) {
    badges.push({ emoji: '🏆', text: 'Consistency 100%' })
  }

  // Weight delta
  const withWeight = (gezondheid ?? []).filter(g => g.gewicht && Number(g.gewicht) > 0)
  let weightDelta: number | null = null
  if (withWeight.length >= 4) {
    const half = Math.min(7, Math.floor(withWeight.length / 2))
    const recent = withWeight.slice(0, half)
    const older = withWeight.slice(half)
    if (recent.length > 0 && older.length > 0) {
      weightDelta = recent.reduce((s, g) => s + Number(g.gewicht), 0) / recent.length
        - older.reduce((s, g) => s + Number(g.gewicht), 0) / older.length
    }
  }
  if (weightDelta !== null && weightDelta < -0.3 && score >= 65 && badges.length < 3) {
    badges.push({ emoji: '📉', text: `Gewicht ${weightDelta.toFixed(1)} kg` })
  }

  // High strength frequency
  const weekStrength = hevy.filter(h => h.start_time >= weekStart).length
  const allTimes = [...activities.map(a => a.start_date), ...hevy.map(h => h.start_time)].sort().reverse()
  const hoursSinceLast = allTimes.length ? (Date.now() - new Date(allTimes[0]).getTime()) / 3600000 : null
  const recPct = hoursSinceLast !== null ? (hoursSinceLast < 12 ? 45 : hoursSinceLast < 24 ? 65 : hoursSinceLast < 48 ? 82 : 95) : 95
  if (weekStrength >= 4 && recPct < 70 && badges.length < 3) {
    badges.push({ emoji: '⚠️', text: `Herstel laag (${weekStrength}× kracht)` })
  }

  // Protein gap
  const hasTodayActivity = activities.some(a => a.start_date.startsWith(today)) || hevy.some(h => h.start_time.startsWith(today))
  const todayProtein = (foodData?.foodLog ?? []).reduce((s: number, f: any) => s + (Number(f.protein) || 0), 0)
  const proteinTarget = Number(foodData?.targets?.protein) || 0
  if (hasTodayActivity && proteinTarget > 0 && todayProtein / proteinTarget < 0.75 && badges.length < 3) {
    badges.push({ emoji: '🍗', text: 'Eiwitdoel niet gehaald' })
  }

  // Low load
  if (loadRatio < 0.6 && activities.length > 0 && badges.length < 3) {
    badges.push({ emoji: '📉', text: 'Belasting laag vs vorige week' })
  }

  // Building + stable weight
  const earlyKjCheck = activities.filter(a => a.start_date >= thirtyDaysAgo && a.start_date < fifteenDaysAgo).reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const lateKjCheck = activities.filter(a => a.start_date >= fifteenDaysAgo).reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const loadTrendPct = earlyKjCheck > 0 ? (lateKjCheck - earlyKjCheck) / earlyKjCheck * 100 : 0
  if (loadTrendPct > 10 && weightDelta !== null && Math.abs(weightDelta) < 0.2 && badges.length < 3) {
    badges.push({ emoji: '📈', text: 'Volume stijgt, gewicht stabiel' })
  }

  return badges.slice(0, 3)
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

function RunningReadinessCard({ readiness }: { readiness: { pct: number; suggestion: string } }) {
  const c = readiness.pct >= 85 ? '#4ade80' : readiness.pct >= 70 ? '#facc15' : '#fb923c'
  const label = readiness.pct >= 85 ? 'Optimaal herstel' : readiness.pct >= 70 ? 'Goed genoeg' : 'Licht vermoeid'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Loopgereedheid</span>
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[40px] font-bold text-white leading-none">{readiness.pct}%</span>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-[15px] font-semibold" style={{ color: c }}>{label}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 pb-1">
            <span className="text-[12px] text-white/40">Advies vandaag</span>
            <span className="text-[15px] font-semibold text-teal-400">{readiness.suggestion}</span>
          </div>
        </div>
        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full" style={{ width: `${readiness.pct}%`, background: c }} />
        </div>
      </div>
    </Card>
  )
}

function LastRunCard({ run }: { run: Activity }) {
  const pace = run.average_speed ? formatPace(run.average_speed) : null
  const dist = run.distance ? `${(run.distance / 1000).toFixed(2)} km` : null
  const dur = run.moving_time ? formatDuration(run.moving_time) : null
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Laatste Run</span>
        <span className="text-[17px] font-semibold text-white leading-snug">{run.name}</span>
        <span className="text-[12px] text-white/40">{formatDate(run.start_date)}</span>
        <div className="flex gap-5 mt-1">
          {dist && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-white leading-none">{dist}</span><span className="text-[11px] text-white/40">Afstand</span></div>}
          {pace && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-teal-400 leading-none">{pace}</span><span className="text-[11px] text-white/40">Tempo /km</span></div>}
          {dur && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-white leading-none">{dur}</span><span className="text-[11px] text-white/40">Duur</span></div>}
        </div>
      </div>
    </Card>
  )
}

function RunningTrendCard({ trend }: { trend: ReturnType<typeof computeRunning7DayTrend> }) {
  const volSign = (trend.volPct ?? 0) > 0 ? '+' : ''
  const volColor = (trend.volPct ?? 0) > 10 ? '#4ade80' : (trend.volPct ?? 0) < -10 ? '#f87171' : 'rgba(255,255,255,0.5)'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">7 Dagen Overzicht</span>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-bold text-white leading-none">{trend.vol7 > 0 ? `${trend.vol7.toFixed(1)}` : '–'}</span>
            <span className="text-[11px] text-white/40">km</span>
            {trend.volPct !== null && (
              <span className="text-[12px] font-semibold" style={{ color: volColor }}>{volSign}{trend.volPct}% vs vorige week</span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-bold text-teal-400 leading-none">{trend.avgPace7 ?? '–'}</span>
            <span className="text-[11px] text-white/40">/km gemiddeld</span>
            {trend.paceDir && <span className="text-[12px] text-white/40">{trend.paceDir} vs vorige week</span>}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-bold text-white leading-none">{trend.runs7}</span>
            <span className="text-[11px] text-white/40">runs</span>
            {trend.runs14to7 > 0 && <span className="text-[12px] text-white/40">vs {trend.runs14to7} vorige week</span>}
          </div>
        </div>
      </div>
    </Card>
  )
}

function CyclingReadinessCard({ readiness }: { readiness: { pct: number; suggestion: string } }) {
  const c = readiness.pct >= 85 ? '#4ade80' : readiness.pct >= 70 ? '#facc15' : '#fb923c'
  const label = readiness.pct >= 85 ? 'Optimaal herstel' : readiness.pct >= 70 ? 'Goed genoeg' : 'Licht vermoeid'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Fietsgereedheid</span>
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[40px] font-bold text-white leading-none">{readiness.pct}%</span>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-[15px] font-semibold" style={{ color: c }}>{label}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 pb-1">
            <span className="text-[12px] text-white/40">Advies vandaag</span>
            <span className="text-[15px] font-semibold text-cyan-400">{readiness.suggestion}</span>
          </div>
        </div>
        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full" style={{ width: `${readiness.pct}%`, background: c }} />
        </div>
      </div>
    </Card>
  )
}

function LastRideCard({ ride }: { ride: Activity }) {
  const speed = ride.average_speed ? `${(ride.average_speed * 3.6).toFixed(1)} km/h` : null
  const dist = ride.distance ? `${(ride.distance / 1000).toFixed(1)} km` : null
  const dur = ride.moving_time ? formatDuration(ride.moving_time) : null
  const elev = ride.total_elevation_gain ? `${Math.round(ride.total_elevation_gain)} m` : null
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Laatste Rit</span>
        <span className="text-[17px] font-semibold text-white leading-snug">{ride.name}</span>
        <span className="text-[12px] text-white/40">{formatDate(ride.start_date)}</span>
        <div className="flex gap-5 mt-1">
          {dist && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-white leading-none">{dist}</span><span className="text-[11px] text-white/40">Afstand</span></div>}
          {speed && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-cyan-400 leading-none">{speed}</span><span className="text-[11px] text-white/40">Snelheid</span></div>}
          {dur && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-white leading-none">{dur}</span><span className="text-[11px] text-white/40">Duur</span></div>}
          {elev && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-orange-400 leading-none">{elev}</span><span className="text-[11px] text-white/40">Klimmen</span></div>}
        </div>
      </div>
    </Card>
  )
}

function CyclingWeeklyTrendCard({ trend }: { trend: ReturnType<typeof computeCyclingWeeklyTrend> }) {
  const kmSign = (trend.kmPct ?? 0) > 0 ? '+' : ''
  const kmColor = (trend.kmPct ?? 0) > 10 ? '#4ade80' : (trend.kmPct ?? 0) < -10 ? '#f87171' : 'rgba(255,255,255,0.5)'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Week Overzicht</span>
        <div className="grid grid-cols-4 gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[20px] font-bold text-white leading-none">{trend.km7 > 0 ? `${trend.km7.toFixed(0)}` : '–'}</span>
            <span className="text-[11px] text-white/40">km</span>
            {trend.kmPct !== null && <span className="text-[11px] font-semibold" style={{ color: kmColor }}>{kmSign}{trend.kmPct}%</span>}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[20px] font-bold text-white leading-none">{trend.dur7 > 0 ? formatDuration(trend.dur7) : '–'}</span>
            <span className="text-[11px] text-white/40">duur</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[20px] font-bold text-orange-400 leading-none">{trend.elev7 > 0 ? `${Math.round(trend.elev7)}` : '–'}</span>
            <span className="text-[11px] text-white/40">m klim</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[20px] font-bold text-cyan-400 leading-none">{trend.rideCount}</span>
            <span className="text-[11px] text-white/40">ritten</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function StrengthProgressCard({ progress }: { progress: ReturnType<typeof computeStrengthProgress> }) {
  const delta = (pct: number | null) => {
    if (pct === null) return ''
    return pct > 0 ? `↑ +${pct}%` : pct < 0 ? `↓ ${pct}%` : '→ stabiel'
  }
  const dColor = (pct: number | null) => {
    if (pct === null) return 'rgba(255,255,255,0.3)'
    return pct > 5 ? '#4ade80' : pct < -5 ? '#f87171' : 'rgba(255,255,255,0.5)'
  }
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Voortgang Deze Week</span>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Volume', value: progress.vol7 > 0 ? `${Math.round(progress.vol7).toLocaleString('nl-NL')}` : '–', unit: 'kg', pct: progress.volumePct },
            { label: 'Sets', value: `${progress.sets7 || '–'}`, unit: '', pct: progress.setsPct },
            { label: 'Sessies', value: `${progress.sessions7 || '–'}`, unit: '', pct: progress.sessionsPct },
          ].map(item => (
            <div key={item.label} className="flex flex-col gap-0.5">
              <span className="text-[22px] font-bold text-white leading-none">{item.value}</span>
              {item.unit && <span className="text-[11px] text-white/40">{item.unit}</span>}
              <span className="text-[11px] text-white/40">{item.label}</span>
              <span className="text-[12px] font-semibold" style={{ color: dColor(item.pct) }}>{delta(item.pct)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function MuscleDistributionCard({ distribution }: { distribution: { label: string; pct: number; color: string }[] }) {
  if (distribution.length === 0) return null
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Spiergroep Verdeling</span>
        {distribution.map(g => (
          <div key={g.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white">{g.label}</span>
              <span className="text-[13px] font-semibold" style={{ color: g.color }}>{g.pct}%</span>
            </div>
            <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full" style={{ width: `${g.pct}%`, background: g.color }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
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

function computeTodaysFocus(
  activities: Activity[],
  hevy: HevyWorkout[],
  calendarEvents: any[],
  recoveryPct: number,
  perf: { score: number; label: string; color: string; loadRatio: number }
): { emoji: string; label: string; sub: string } {
  const weekStart = startOfWeek()
  const weekStrength = hevy.filter(h => h.start_time >= weekStart).length
  const weekRuns = activities.filter(a => isRun(a) && a.start_date >= weekStart).length

  if (recoveryPct < 40 || perf.loadRatio > 1.4) {
    return {
      emoji: '😴',
      label: 'Hersteldag',
      sub: perf.loadRatio > 1.4 ? 'Trainingsbelasting is hoog — rust aangeraden' : 'Lichaam heeft rust nodig',
    }
  }

  const now = new Date().toISOString()
  const threeDaysAhead = new Date(Date.now() + 3 * 86400000).toISOString()
  const nextEvent = (calendarEvents ?? [])
    .filter((e: any) => { const dt = e.start_datetime || e.start_date; return dt >= now && dt <= threeDaysAhead })
    .sort((a: any, b: any) => (a.start_datetime || a.start_date).localeCompare(b.start_datetime || b.start_date))[0]

  if (nextEvent) {
    const title = (nextEvent.title ?? '') as string
    const tl = title.toLowerCase()
    const dateStr = nextEvent.start_datetime || nextEvent.start_date
    const when = new Date(dateStr).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' })
    const time = nextEvent.start_datetime
      ? ' · ' + new Date(nextEvent.start_datetime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
      : ''
    if (tl.includes('strength') || tl.includes('gym') || tl.includes('kracht') || tl.includes('push') || tl.includes('pull') || tl.includes('legs')) {
      return { emoji: '💪', label: title, sub: when + time }
    }
    if (tl.includes('run') || tl.includes('loop') || tl.includes('tempo') || tl.includes('interval') || tl.includes('hardloop')) {
      return { emoji: '🏃', label: title, sub: when + time }
    }
    if (tl.includes('ride') || tl.includes('fiet') || tl.includes('cycl') || tl.includes('bike')) {
      return { emoji: '🚴', label: title, sub: when + time }
    }
    return { emoji: '📅', label: title, sub: when + time }
  }

  if (recoveryPct >= 82 && perf.score >= 70) {
    return weekRuns <= weekStrength
      ? { emoji: '🏃', label: 'Tempo Run Aangeraden', sub: 'Herstel optimaal · prestaties op niveau' }
      : { emoji: '💪', label: 'Krachttraining Aangeraden', sub: 'Herstel optimaal · prestaties op niveau' }
  }
  if (recoveryPct >= 65) {
    return weekStrength < 2
      ? { emoji: '💪', label: 'Gym Session Aangeraden', sub: 'Krachttraining dit week nog beperkt' }
      : { emoji: '🚴', label: 'Recovery Ride Aangeraden', sub: 'Gemiddeld herstel · lichte training aangeraden' }
  }
  return { emoji: '🏃', label: 'Lichte Run Aangeraden', sub: 'Herstel aan de gang · rustig tempo aangeraden' }
}

function computeRecoveryDetail(
  activities: Activity[],
  hevy: HevyWorkout[]
): { pct: number; label: string; factors: string[] } {
  const allTimes = [...activities.map(a => a.start_date), ...hevy.map(h => h.start_time)].sort().reverse()
  if (allTimes.length === 0) {
    return { pct: 95, label: 'Volledig hersteld', factors: ['Geen recente trainingen gevonden'] }
  }
  const hoursSinceLast = (Date.now() - new Date(allTimes[0]).getTime()) / 3600000
  let pct = hoursSinceLast < 12 ? 45 : hoursSinceLast < 24 ? 65 : hoursSinceLast < 48 ? 82 : 95

  const weekStart = startOfWeek()
  const weekStrength = hevy.filter(h => h.start_time >= weekStart).length
  const weekActivity = activities.filter(a => a.start_date >= weekStart).length
  const weekTotal = weekStrength + weekActivity

  const factors: string[] = []
  const h = Math.round(hoursSinceLast)
  factors.push(h < 24 ? `Laatste training: ${h}u geleden` : `Laatste training: ${Math.round(hoursSinceLast / 24)}d geleden`)

  if (weekStrength >= 4) {
    pct = Math.round(pct * 0.85)
    factors.push(`${weekStrength} krachttrainingen dit week verlagen herstel`)
  } else if (weekTotal >= 6) {
    pct = Math.round(pct * 0.90)
    factors.push(`Hoge trainingsfrequentie: ${weekTotal} sessies dit week`)
  } else {
    factors.push(`${weekTotal} sessie${weekTotal !== 1 ? 's' : ''} voltooid dit week`)
  }

  pct = Math.min(95, Math.max(15, pct))
  const label = pct >= 70 ? 'Trainbaar' : pct >= 45 ? 'Licht herstel aanbevolen' : 'Hoge vermoeidheid'
  return { pct, label, factors }
}

function TodaysFocusCard({ focus }: { focus: { emoji: string; label: string; sub: string } }) {
  return (
    <Card>
      <div className="flex items-center gap-4">
        <span className="text-[36px] leading-none">{focus.emoji}</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Focus Vandaag</span>
          <span className="text-[17px] font-semibold text-white leading-snug">{focus.label}</span>
          <span className="text-[13px] text-white/50">{focus.sub}</span>
        </div>
      </div>
    </Card>
  )
}

function PerformanceHeroCard({ perf }: { perf: ReturnType<typeof computePerformanceScore> }) {
  const trendLabel = perf.loadRatio > 1.1 ? '↑ Belasting stijgend' : perf.loadRatio < 0.9 ? '↓ Belasting dalend' : '→ Belasting stabiel'
  const { consistency, loadBalance, trend } = perf.breakdown
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Performance Score</span>
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[56px] font-bold text-white leading-none">{perf.score}</span>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="w-[8px] h-[8px] rounded-full" style={{ background: perf.color }} />
              <span className="text-[17px] font-semibold text-white">{perf.label}</span>
            </div>
          </div>
          <span className="text-[13px] text-white/40 pb-1">{trendLabel}</span>
        </div>
        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${perf.score}%`, background: perf.color }} />
        </div>
        <div className="flex gap-2 pt-1">
          {[
            { label: 'Consistency', value: consistency },
            { label: 'Load Balance', value: loadBalance },
            { label: 'Trend', value: trend },
          ].map(item => (
            <div key={item.label} className="flex-1 flex flex-col gap-0.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <span className="text-[11px] text-white/40">{item.label}</span>
              <span className="text-[15px] font-bold text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function RecoveryDetailCard({ recovery }: { recovery: { pct: number; label: string; factors: string[] } }) {
  const c = recovery.pct >= 70 ? '#4ade80' : recovery.pct >= 45 ? '#fb923c' : '#f87171'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Herstel</span>
        <div className="flex items-end justify-between">
          <span className="text-[40px] font-bold text-white leading-none">{recovery.pct}%</span>
          <span className="text-[15px] font-semibold pb-1" style={{ color: c }}>{recovery.label}</span>
        </div>
        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full" style={{ width: `${recovery.pct}%`, background: c }} />
        </div>
        <div className="flex flex-col gap-1.5 pt-1">
          {recovery.factors.map((f, i) => (
            <span key={i} className="text-[13px] text-white/50">· {f}</span>
          ))}
        </div>
      </div>
    </Card>
  )
}

function TrainingLoadCard({ weekCompleted, weekPlanned, weekKm, weekDurationSecs, weekVolume, earlyKj, loadTrend }: {
  weekCompleted: number; weekPlanned: number; weekKm: number; weekDurationSecs: number
  weekVolume: number; earlyKj: number; loadTrend: number
}) {
  const trendSign = loadTrend > 0 ? '+' : ''
  const trendColor = loadTrend > 10 ? '#4ade80' : loadTrend < -10 ? '#f87171' : 'rgba(255,255,255,0.5)'
  const stats = [
    weekCompleted > 0 && `${weekCompleted} sessie${weekCompleted !== 1 ? 's' : ''}${weekPlanned > 0 ? ` (${weekPlanned} gepland)` : ''}`,
    weekDurationSecs > 0 && `${formatDuration(weekDurationSecs)} totaal`,
    weekKm > 0 && `${weekKm.toFixed(1)} km gelopen`,
    weekVolume > 0 && `${Math.round(weekVolume).toLocaleString('nl-NL')} kg volume`,
  ].filter(Boolean) as string[]

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Trainingsbelasting</span>
        {stats.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {stats.map((s, i) => (
              <span key={i} className="text-[14px] text-white/80">{s}</span>
            ))}
          </div>
        ) : (
          <span className="text-[14px] text-white/30">Geen trainingen deze week</span>
        )}
        {earlyKj > 0 && (
          <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
            <span className="text-[15px] font-bold" style={{ color: trendColor }}>{trendSign}{loadTrend}%</span>
            <span className="text-[13px] text-white/40">vs vorige 14 dagen —</span>
            <span className="text-[13px] text-white/40">
              {Math.abs(loadTrend) <= 10 ? 'stabiel' : loadTrend > 10 ? 'stijgend' : 'dalend'}
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}

function TopInsightsCard({ insights }: { insights: InsightBadge[] }) {
  if (insights.length === 0) return null
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-teal-400 text-[14px]">↗</span>
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">Top Inzichten</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {insights.map((badge, i) => (
            <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.07)' }}>
              <span className="text-[14px] leading-none">{badge.emoji}</span>
              <span className="text-[13px] font-semibold text-white/80">{badge.text}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function NextWorkoutCard({ calendarEvents, onRefresh, refreshing }: {
  calendarEvents: any[]; onRefresh?: () => void; refreshing?: boolean
}) {
  const now = new Date().toISOString()
  const next = (calendarEvents ?? [])
    .filter((e: any) => (e.start_datetime || e.start_date) >= now)
    .sort((a: any, b: any) => (a.start_datetime || a.start_date).localeCompare(b.start_datetime || b.start_date))[0]

  const dateStr = next ? (next.start_datetime || next.start_date) : null
  const when = dateStr ? new Date(dateStr).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' }) : null
  const time = next?.start_datetime
    ? new Date(next.start_datetime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : null
  let countdown: string | null = null
  if (dateStr) {
    const diffDays = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
    countdown = diffDays <= 0 ? 'Vandaag' : diffDays === 1 ? 'Morgen' : `Over ${diffDays} dagen`
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Volgende Workout</span>
          {next ? (
            <>
              {countdown && <span className="text-[12px] font-semibold text-teal-400 mt-1">{countdown}</span>}
              <span className="text-[17px] font-semibold text-white">{next.title}</span>
              <span className="text-[13px] text-white/50">{when}{time ? ` · ${time}` : ''}</span>
            </>
          ) : (
            <span className="text-[15px] text-white/30 mt-1">Geen geplande trainingen</span>
          )}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className={`text-teal-400 text-[13px] font-semibold px-3 py-1.5 rounded-full transition-opacity ${refreshing ? 'opacity-40' : ''}`}
            style={{ background: 'rgba(45,212,191,0.12)' }}
          >
            {refreshing ? '...' : 'Sync'}
          </button>
        )}
      </div>
    </Card>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export function OverviewSection({ activities, hevy, calendarEvents, onRefresh, refreshing }: {
  activities: Activity[]; hevy: HevyWorkout[]; calendarEvents: any[]
  onRefresh?: () => void; refreshing?: boolean
}) {
  const { data: gezondheid } = useSWR<{ datum: string; stappen: number; gewicht: number }[]>('health-gezondheid', null)
  const { data: foodData } = useSWR<{ foodLog: any[]; targets: any }>('food-log', null)

  const perf = computePerformanceScore(activities, hevy)
  const recoveryDetail = computeRecoveryDetail(activities, hevy)

  const now = Date.now()
  const weekStart = startOfWeek()
  const fifteenDaysAgo = new Date(now - 15 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString()

  const earlyKj = activities
    .filter(a => a.start_date >= thirtyDaysAgo && a.start_date < fifteenDaysAgo)
    .reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const lateKj = activities
    .filter(a => a.start_date >= fifteenDaysAgo)
    .reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const loadTrend = earlyKj > 0 ? Math.round((lateKj - earlyKj) / earlyKj * 100) : 0

  const weekActivities = activities.filter(a => a.start_date >= weekStart)
  const weekHevy = hevy.filter(h => h.start_time >= weekStart)
  const weekCompleted = weekActivities.length + weekHevy.length
  const weekEnd = new Date(new Date(weekStart).getTime() + 7 * 86400000).toISOString()
  const weekPlanned = (calendarEvents ?? []).filter((e: any) => {
    const dt = e.start_datetime || e.start_date
    return dt >= weekStart && dt < weekEnd
  }).length
  const weekKm = weekActivities.filter(isRun).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const weekDurationSecs = [...weekActivities, ...weekHevy].reduce((s: number, a: any) => s + (a.moving_time ?? a.duration ?? 0), 0)
  const weekVolume = weekHevy.reduce((s, h) => s + (h.volume_kg ?? 0), 0)

  const todaysFocus = computeTodaysFocus(activities, hevy, calendarEvents, recoveryDetail.pct, perf)
  const topInsights = buildTopInsights(activities, hevy, gezondheid ?? null, foodData ?? null)

  return (
    <div className="flex flex-col gap-[18px]">
      {/* 1. AI Insight */}
      <AiInsight text={buildOverviewInsight(activities, hevy)} />

      {/* 2. Today's Focus */}
      <TodaysFocusCard focus={todaysFocus} />

      {/* 3. Performance Score */}
      <PerformanceHeroCard perf={perf} />

      {/* 4. Recovery */}
      <RecoveryDetailCard recovery={recoveryDetail} />

      {/* 5. Training Load */}
      <TrainingLoadCard
        weekCompleted={weekCompleted}
        weekPlanned={weekPlanned}
        weekKm={weekKm}
        weekDurationSecs={weekDurationSecs}
        weekVolume={weekVolume}
        earlyKj={earlyKj}
        loadTrend={loadTrend}
      />

      {/* 6. Top Insights */}
      <TopInsightsCard insights={topInsights} />

      {/* 7. Next Workout */}
      <NextWorkoutCard calendarEvents={calendarEvents} onRefresh={onRefresh} refreshing={refreshing} />
    </div>
  )
}

// ─── Running ──────────────────────────────────────────────────────────────────

export function RunningSection({ activities }: { activities: Activity[] }) {
  const readiness = computeRunningReadiness(activities)
  const trend = computeRunning7DayTrend(activities)
  const allRuns = activities.filter(isRun).sort((a, b) => b.start_date.localeCompare(a.start_date))
  const lastRun = allRuns[0] ?? null

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const weekRuns = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo)
  const cadenceRuns = weekRuns.filter(a => a.average_cadence)
  const avgCadence = cadenceRuns.length
    ? Math.round(cadenceRuns.reduce((s, a) => s + (a.average_cadence ?? 0), 0) / cadenceRuns.length * 2)
    : 0
  const efficiencyTrend = computeRunningEfficiencyTrend(activities)

  const bestRunDist = allRuns.length > 0 ? Math.max(...allRuns.map(a => a.distance ?? 0)) : 0
  const showProjections = allRuns.length >= 3 && bestRunDist >= 3000
  const projections = showProjections ? computeRaceProjections(activities) : null

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={buildRunningInsight(activities)} />

      <RunningReadinessCard readiness={readiness} />

      {lastRun && <LastRunCard run={lastRun} />}

      <RunningTrendCard trend={trend} />

      {avgCadence > 0 && (
        <Card>
          <div className="flex flex-col gap-4">
            <span className="text-[15px] font-semibold text-white/50">Loopmetrics</span>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Cadence', value: `${avgCadence}`, unit: 'spm', color: '#60a5fa' },
                { label: 'Stride', value: '–', unit: 'm', color: '#2dd4bf' },
                { label: 'Oscillatie', value: '–', unit: 'cm', color: '#fb923c' },
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
      )}

      {projections && (
        <Card>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold text-white/50">Wedstrijdprojecties</span>
              <span className="text-[12px] text-teal-400">Riegel formule</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {([
                { dist: '5K', time: projections['5K'] },
                { dist: '10K', time: projections['10K'] },
                ...(bestRunDist >= 5000 ? [{ dist: 'Half', time: projections['Half'] }] : []),
                ...(bestRunDist >= 10000 ? [{ dist: 'Marathon', time: projections['Marathon'] }] : []),
              ] as { dist: string; time: string }[]).map(pr => (
                <div key={pr.dist} className="flex flex-col items-center gap-1">
                  <span className="text-[15px] font-bold text-white leading-tight text-center">{pr.time}</span>
                  <span className="text-[11px] text-white/40">{pr.dist}</span>
                  <span className="text-[11px] font-medium text-teal-400">Projectie</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Cycling ──────────────────────────────────────────────────────────────────

export function CyclingSection({ activities }: { activities: Activity[] }) {
  const readiness = computeCyclingReadiness(activities)
  const trend = computeCyclingWeeklyTrend(activities)
  const allRides = activities.filter(isRide).sort((a, b) => b.start_date.localeCompare(a.start_date))
  const lastRide = allRides[0] ?? null
  const ftp = computeFTP(activities)
  const enduranceTrend = computeCyclingEnduranceTrend(activities)

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={buildCyclingInsight(activities)} />

      <CyclingReadinessCard readiness={readiness} />

      {lastRide && <LastRideCard ride={lastRide} />}

      <CyclingWeeklyTrendCard trend={trend} />

      {enduranceTrend !== null && (
        <Card>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-white/50">Duuruithoudingsvermogen</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-[28px] font-bold ${enduranceTrend >= 0 ? 'text-teal-400' : 'text-red-400'}`}>
                {enduranceTrend > 0 ? '+' : ''}{enduranceTrend.toFixed(1)}%
              </span>
              <span className="text-[15px] text-white/50">gem. snelheid over 4 weken</span>
            </div>
            <span className="text-[13px] text-white/40">
              {enduranceTrend >= 0 ? 'Fitness verbetert' : 'Fitness daalt'} vs eerste helft van 30-daags venster
            </span>
          </div>
        </Card>
      )}

      {ftp && (
        <Card>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Geschatte FTP</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[40px] font-bold text-purple-400 leading-none">{ftp}</span>
              <span className="text-[17px] font-semibold text-white/50">W</span>
            </div>
            <span className="text-[13px] text-white/40">Berekend uit kJ/tijd op ritten langer dan 45 min</span>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Strength ─────────────────────────────────────────────────────────────────

export function StrengthSection({ hevy }: { hevy: HevyWorkout[] }) {
  const progress = computeStrengthProgress(hevy)
  const distribution = computeMuscleDistribution(hevy)
  const keyLifts = extractKeyLifts(hevy)
  const allMuscleRecovery = computeMuscleRecovery(hevy)
  const recoveringGroups = allMuscleRecovery.filter(g => g.recovery < 95)

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={buildStrengthInsight(hevy)} />

      <StrengthProgressCard progress={progress} />

      <MuscleDistributionCard distribution={distribution} />

      {recoveringGroups.length > 0 && (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold text-white/50">Spiergroep Herstel</span>
              <span className="text-[12px] text-white/30">{recoveringGroups.length} groep{recoveringGroups.length > 1 ? 'en' : ''} herstelt nog</span>
            </div>
            {recoveringGroups.map(g => (
              <MuscleRecoveryBar key={g.label} label={g.label} recovery={g.recovery} />
            ))}
          </div>
        </Card>
      )}

      {keyLifts.length > 0 && (
        <Card>
          <div className="flex flex-col gap-3">
            <span className="text-[15px] font-semibold text-white/50">Geschatte 1RM</span>
            {keyLifts.map(l => (
              <div key={l.name} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }} />
                <div className="flex-1">
                  <p className="text-[15px] font-medium text-white">{l.name}</p>
                  <p className="text-[12px] text-white/40">{l.current1RM} kg geschatte 1RM</p>
                </div>
                <span className={`text-[13px] font-semibold ${l.color}`}>{l.trend}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
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

  return (
    <div className="flex flex-col gap-6">
      {/* Recent workouts first — most actionable info */}
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

      {/* Month summary */}
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

      {/* Compact calendar last */}
      <Card>
        <div className="flex flex-col gap-3">
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
              <div key={i} className="text-center text-[11px] font-semibold text-white/40 pb-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} className="h-[36px]" />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const isToday = day === todayDay
              const hasWorkout = workoutDays.has(day)
              const showCircle = isToday || hasWorkout
              return (
                <div key={day} className="h-[36px] flex items-center justify-center">
                  <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
                    style={showCircle ? { background: 'white' } : {}}>
                    <span className="text-[13px] leading-none"
                      style={{ fontWeight: showCircle ? 700 : 400, color: showCircle ? 'black' : 'rgba(255,255,255,0.75)' }}>
                      {day}
                    </span>
                  </div>
                </div>
              )
            })}
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
