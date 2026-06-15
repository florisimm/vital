'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import useSWR from 'swr'
import { TrendingUp, Timer, Dumbbell, Bike, PersonStanding, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Card, SectionHeader } from '@/components/ui'
import { computePhysiologyReadiness, type HealthRow } from '@/lib/readiness'
import { computePersonalProfile, type PersonalProfile } from '@/lib/personal-learning'
import { formatTime as formatClockTime } from '@/lib/timeFormat'

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

type SportBreakdown = {
  key: string; label: string; acwr: number | null
  confidence: 'low' | 'medium' | 'high'; daysWithData: number
  acuteLoad: number; isNew: boolean; hasPrimaryLoad: boolean
  loadComposition: { primary: number; isolation: number; accessory: number } | null
}
type ACWRDetail = {
  total: number | null; confidence: 'low' | 'medium' | 'high'
  sports: SportBreakdown[]; explanation: string
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function startOfWeek() {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString()
}

export function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
  if (h === 0 && m === 0) return '–'
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatPace(mPerSec: number) {
  const s = 1000 / mPerSec
  return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
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

function isSwim(a: Activity) {
  return a.sport_type?.toLowerCase().includes('swim')
}

function isWeightTraining(a: Activity) {
  return a.sport_type?.toLowerCase() === 'weighttraining'
}

function isCycling(a: Activity) {
  return a.sport_type?.toLowerCase().includes('ride')
}

// Consistent load unit (minutes) with zone-2 dampening.
// Avoids mixing real kilojoules (available on recent Strava syncs) with the
// moving_time fallback on older records, which would inflate acute:chronic ratios.
function cardioZoneMultiplier(hr: number): number {
  if (hr < 130) return 0.25  // Zone 1: recovery
  if (hr < 150) return 0.50  // Zone 2: aerobic base
  if (hr < 165) return 0.75  // Zone 3: aerobic threshold
  if (hr < 175) return 1.00  // Zone 4: lactate threshold
  return 1.25                 // Zone 5: VO2max / race effort
}

function effectiveLoad(a: Activity): number {
  const mins = (a.moving_time ?? 0) / 60
  if (mins === 0) return 0
  if (a.average_heartrate) return mins * cardioZoneMultiplier(a.average_heartrate)
  if (isRun(a) && a.average_speed) {
    const mps = a.average_speed
    return mins * (mps > 4.0 ? 1.00 : mps > 3.2 ? 0.75 : 0.50)
  }
  if (isRide(a) && a.average_speed) {
    const kmh = a.average_speed * 3.6
    return mins * (kmh > 30 ? 1.00 : kmh > 22 ? 0.75 : 0.50)
  }
  return mins * 0.75
}

const COMPOUND_KEYWORDS = [
  'squat', 'deadlift', 'rdl', 'bench', 'incline', 'overhead press', 'ohp',
  'shoulder press', 'military press', 'row', 'pull-up', 'pullup', 'pull up',
  'chin-up', 'chinup', 'chin up', 'lunge', 'hip thrust',
]
const ISOLATION_KEYWORDS = [
  'curl', 'tricep', 'lateral raise', 'rear delt', 'face pull',
  'calf', 'leg extension', 'leg curl', 'fly', 'flye', 'shrug', 'kickback',
]
const RECOVERY_TITLE_KEYWORDS = [
  'stretch', 'mobility', 'foam', 'recover', 'recovery',
  'warm up', 'warm-up', 'warmup', 'cooldown', 'cool down', 'cool-down',
]
const ACCESSORY_TITLE_KEYWORDS = ['abs', 'core', 'yoga']

// Per-set intensity factor using Epley %1RM estimate combined with rep-range modifier.
// Normalised so that 8 reps at typical working weight ≈ 1.0.
function setIntensityFactor(sets: Array<{ weight_kg: number; reps: number }>): number {
  const valid = (sets ?? []).filter(s => s.reps > 0)
  if (!valid.length) return 1.0
  const avg = valid.reduce((sum, s) => {
    if (s.weight_kg <= 0) return sum + (s.reps <= 10 ? 0.85 : 0.65)  // bodyweight
    const pct1rm = s.reps <= 1 ? 1.0 : 30 / (30 + s.reps)
    const repMod = s.reps <= 3 ? 1.35 : s.reps <= 6 ? 1.15 : s.reps <= 12 ? 1.0 : 0.7
    return sum + Math.min(1.5, pct1rm * repMod)
  }, 0) / valid.length
  return Math.max(0.4, avg)
}

// Returns a 0.10–1.0 load factor for a Hevy workout based on exercise composition.
// With exercise data: compound × 1.0 + isolation × 0.6 + other × 0.25 (weighted by set counts).
// Without exercise data: title-based — recovery → 0.10, accessory → 0.25, primary → 1.0.
function sessionLoadFactor(h: HevyWorkout): number {
  if (h.exercises && h.exercises.length > 0) {
    const totalSets = h.exercises.reduce((s, ex) => s + (ex.sets?.length ?? 0), 0)
    if (totalSets > 0) {
      let compEff = 0, isoEff = 0, otherEff = 0
      for (const ex of h.exercises) {
        const t = (ex.title ?? '').toLowerCase()
        const n = ex.sets?.length ?? 0
        const intensity = setIntensityFactor(ex.sets ?? [])
        if (COMPOUND_KEYWORDS.some(k => t.includes(k)))       compEff  += n * 1.0 * intensity
        else if (ISOLATION_KEYWORDS.some(k => t.includes(k))) isoEff   += n * 0.6 * intensity
        else                                                    otherEff += n * 0.25 * intensity
      }
      return (compEff + isoEff + otherEff) / totalSets
    }
  }
  const t = (h.title ?? '').toLowerCase()
  if (RECOVERY_TITLE_KEYWORDS.some(k => t.includes(k))) return 0.10
  if (ACCESSORY_TITLE_KEYWORDS.some(k => t.includes(k))) return 0.25
  return 1.0
}

// Splits hevyLoad(h) into compound / isolation / accessory components (sum = hevyLoad(h)).
function sessionLoadBreakdown(h: HevyWorkout): { compound: number; isolation: number; accessory: number } {
  const mins = (h.duration ?? 3600) / 60
  if (h.exercises && h.exercises.length > 0) {
    const totalSets = h.exercises.reduce((s, ex) => s + (ex.sets?.length ?? 0), 0)
    if (totalSets > 0) {
      let compEff = 0, isoEff = 0, otherEff = 0
      for (const ex of h.exercises) {
        const t = (ex.title ?? '').toLowerCase()
        const n = ex.sets?.length ?? 0
        const intensity = setIntensityFactor(ex.sets ?? [])
        if (COMPOUND_KEYWORDS.some(k => t.includes(k)))       compEff  += n * 1.0 * intensity
        else if (ISOLATION_KEYWORDS.some(k => t.includes(k))) isoEff   += n * 0.6 * intensity
        else                                                    otherEff += n * 0.25 * intensity
      }
      const totalEff = compEff + isoEff + otherEff
      if (totalEff === 0) return { compound: 0, isolation: 0, accessory: mins * 0.25 }
      const load = hevyLoad(h)
      return {
        compound:  (compEff / totalEff) * load,
        isolation: (isoEff / totalEff) * load,
        accessory: (otherEff / totalEff) * load,
      }
    }
  }
  const load = hevyLoad(h)
  return sessionLoadFactor(h) > 0.30
    ? { compound: load, isolation: 0, accessory: 0 }
    : { compound: 0,    isolation: 0, accessory: load }
}

// A session is treated as accessory/recovery (excluded from primary-load detection and ramp rate)
// when its load factor is ≤ 0.30 — i.e. recovery (0.10) or accessory (0.25) sessions.
function isAccessorySession(h: HevyWorkout): boolean {
  return sessionLoadFactor(h) <= 0.30
}

function hevyLoad(h: HevyWorkout): number {
  return (h.duration ?? 3600) / 60 * sessionLoadFactor(h)
}

function computeACWRDetail(activities: Activity[], hevy: HevyWorkout[], now: number, rampRate: number | null): ACWRDetail {
  const t7  = new Date(now - 7  * 86400000).toISOString()
  const t28 = new Date(now - 28 * 86400000).toISOString()
  const dy  = (iso: string) => iso.slice(0, 10)

  function calcBreakdown(acts: Activity[], hevyW: HevyWorkout[]) {
    const a28 = acts.filter(a => a.start_date >= t28)
    const h28 = hevyW.filter(h => h.start_time >= t28)
    if (!a28.length && !h28.length) return { acwr: null, confidence: 'low' as const, daysWithData: 0, acuteLoad: 0 }

    const acute    = a28.filter(a => a.start_date >= t7).reduce((s, a) => s + effectiveLoad(a), 0)
                   + h28.filter(h => h.start_time >= t7).reduce((s, h) => s + hevyLoad(h), 0)
    const chronic28 = a28.reduce((s, a) => s + effectiveLoad(a), 0)
                    + h28.reduce((s, h) => s + hevyLoad(h), 0)

    const dySet    = new Set([...a28.map(a => dy(a.start_date)), ...h28.map(h => dy(h.start_time))])
    const sessions = a28.length + h28.length
    const confidence: 'low' | 'medium' | 'high' =
      sessions <= 4 ? 'low' : sessions <= 10 ? 'medium' : 'high'

    const acwr = chronic28 / 4 > 5 ? Math.round((acute / (chronic28 / 4)) * 10) / 10 : null

    return { acwr, confidence, daysWithData: dySet.size, acuteLoad: acute }
  }

  const hevyMain  = hevy.filter(h => !h.title.toLowerCase().includes('hyrox'))
  const hevyHyrox = hevy.filter(h => h.title.toLowerCase().includes('hyrox'))
  const categorised = new Set([
    ...activities.filter(a => isWeightTraining(a) || isCycling(a) || isRun(a)).map(a => a.id),
  ])

  const buckets: { key: string; label: string; acts: Activity[]; hevyW: HevyWorkout[] }[] = [
    { key: 'strength', label: 'Strength', acts: activities.filter(isWeightTraining), hevyW: hevyMain  },
    { key: 'cycling',  label: 'Cycling',  acts: activities.filter(isCycling),         hevyW: []        },
    { key: 'running',  label: 'Running',  acts: activities.filter(isRun),             hevyW: []        },
    { key: 'hyrox',    label: 'HYROX',    acts: [],                                   hevyW: hevyHyrox },
    { key: 'other',    label: 'Other',    acts: activities.filter(a => !categorised.has(a.id)), hevyW: [] },
  ]

  const t56 = new Date(now - 56 * 86400000).toISOString()

  const sports: SportBreakdown[] = buckets
    .map(({ key, label, acts, hevyW }) => {
      const bd = calcBreakdown(acts, hevyW)
      // recentN counts only primary sessions (ignores accessory/recovery) for isNew detection
      const recentN    = acts.filter(a => a.start_date >= t28).length
                       + hevyW.filter(h => h.start_time >= t28 && !isAccessorySession(h)).length
      const recentLoad = acts.filter(a => a.start_date >= t28).reduce((s, a) => s + effectiveLoad(a), 0)
                       + hevyW.filter(h => h.start_time >= t28).reduce((s, h) => s + hevyLoad(h), 0)
      const priorLoad  = acts.filter(a => a.start_date >= t56 && a.start_date < t28).reduce((s, a) => s + effectiveLoad(a), 0)
                       + hevyW.filter(h => h.start_time >= t56 && h.start_time < t28).reduce((s, h) => s + hevyLoad(h), 0)
      // Primary load: at least one non-accessory session in the last 28 days
      const hasPrimaryLoad = acts.filter(a => a.start_date >= t28).length > 0
        || hevyW.filter(h => h.start_time >= t28 && !isAccessorySession(h)).length > 0
      // Load composition (weighted, 28-day window): primary / isolation / accessory %
      const recent28hevy = hevyW.filter(h => h.start_time >= t28)
      const compLoad  = acts.filter(a => a.start_date >= t28).reduce((s, a) => s + effectiveLoad(a), 0)
                      + recent28hevy.reduce((s, h) => s + sessionLoadBreakdown(h).compound, 0)
      const isoLoad   = recent28hevy.reduce((s, h) => s + sessionLoadBreakdown(h).isolation, 0)
      const accLoad   = recent28hevy.reduce((s, h) => s + sessionLoadBreakdown(h).accessory, 0)
      const totalComp = compLoad + isoLoad + accLoad
      const loadComposition = totalComp > 0 ? {
        primary:   Math.round((compLoad / totalComp) * 100),
        isolation: Math.round((isoLoad  / totalComp) * 100),
        accessory: Math.round((accLoad  / totalComp) * 100),
      } : null
      // "New" = at least 2 recent primary sessions AND (no prior baseline OR load exceeds 125% of own 4-week baseline)
      return { key, label, ...bd, isNew: recentN >= 2 && (priorLoad === 0 || recentLoad > priorLoad * 1.25), hasPrimaryLoad, loadComposition }
    })
    .filter(s => s.daysWithData > 0)

  const total = calcBreakdown(activities, hevy)

  // Dynamic explanation — new sports first, then contribution %, then ramp rate
  // Only primary training sessions can trigger elevated-load warnings
  const newSports = sports.filter(s => s.isNew && s.hasPrimaryLoad).map(s => s.label)
  const elevated  = sports.filter(s => s.acwr !== null && s.acwr > 1.3 && s.hasPrimaryLoad).sort((a, b) => (b.acwr ?? 0) - (a.acwr ?? 0))
  let explanation = ''
  if (total.acwr === null) {
    explanation = total.daysWithData > 0
      ? 'Training load too low to calculate ACWR.'
      : 'No training data available in the past 28 days.'
  } else if (newSports.length > 0 && total.acwr > 1.2) {
    explanation = `Load increased due to recently added ${newSports.join(' and ')} sessions. The body is adapting — monitor recovery over the coming weeks.`
    if (total.confidence !== 'high') explanation += ' Limited historical data — ACWR becomes more accurate as more sessions are recorded.'
  } else if (elevated.length > 0) {
    const top = elevated[0]
    const totalAcuteLoad = sports.reduce((s, sp) => s + sp.acuteLoad, 0)
    const contribPct = totalAcuteLoad > 0 ? Math.round((top.acuteLoad / totalAcuteLoad) * 100) : null
    let line = contribPct !== null
      ? `${top.label} currently contributes ${contribPct}% to the elevated ACWR.`
      : `The increase is primarily from ${top.label} (ACWR ${top.acwr?.toFixed(2)}).`
    if (rampRate !== null && Math.abs(rampRate) > 10) {
      const sign = rampRate > 0 ? '+' : ''
      line += ` Ramp rate: ${sign}${rampRate}% vs last week.`
    }
    if (top.confidence !== 'high') line += ' Limited data — value stabilises with more sessions.'
    explanation = line
  } else if (total.confidence === 'low') {
    explanation = 'ACWR is based on few sessions. The value becomes more accurate as more training data is available.'
  } else {
    explanation = 'Your training load is close to your usual level.'
  }

  return { total: total.acwr, confidence: total.confidence, sports, explanation }
}

function formatPace100m(speedMs: number): string {
  const secs = 100 / speedMs
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
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

  const kj7 = activities.filter(a => a.start_date >= sevenDaysAgo).reduce((s, a) => s + effectiveLoad(a), 0)
    + hevy.filter(h => h.start_time >= sevenDaysAgo).reduce((s, h) => s + hevyLoad(h), 0)
  const kj14to7 = activities.filter(a => a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo).reduce((s, a) => s + effectiveLoad(a), 0)
    + hevy.filter(h => h.start_time >= fourteenDaysAgo && h.start_time < sevenDaysAgo).reduce((s, h) => s + hevyLoad(h), 0)
  const loadRatio = kj14to7 > 0 ? kj7 / kj14to7 : 1
  const loadScore = loadRatio > 1.4 ? 0.2 : loadRatio > 1.2 ? 0.7 : loadRatio > 0.7 ? 1 : 0.5

  const recentRuns = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo && a.average_speed)
  const olderRuns = activities.filter(a => isRun(a) && a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo && a.average_speed)
  const avgSpd = (arr: Activity[]) => arr.reduce((s, a) => s + (a.average_speed ?? 0), 0) / arr.length
  const trendScore = recentRuns.length > 0 && olderRuns.length > 0 && avgSpd(recentRuns) > avgSpd(olderRuns)
    ? 1 : recentRuns.length > 0 ? 0.6 : 0.5

  const score = Math.round(consistency * 40 + loadScore * 30 + trendScore * 30)
  // Load-based labels — describe the data, no physiological conclusions
  const label = loadRatio > 1.5 ? 'Very High Load' : loadRatio > 1.3 ? 'High Load' : loadRatio > 1.1 ? 'Elevated Load' : 'Normal Load'
  const color = loadRatio > 1.5 ? '#f87171' : loadRatio > 1.3 ? '#fb923c' : loadRatio > 1.1 ? '#facc15' : '#4ade80'

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

function computeSwimmingReadiness(activities: Activity[]) {
  const swims = activities.filter(isSwim).sort((a, b) => b.start_date.localeCompare(a.start_date))
  if (swims.length === 0) return { pct: 90, suggestion: 'Endurance Swim' }
  const hoursSince = (Date.now() - new Date(swims[0].start_date).getTime()) / 3600000
  const base = hoursSince < 12 ? 55 : hoursSince < 24 ? 70 : hoursSince < 48 ? 82 : 92
  const suggestion = base >= 85 ? 'Sprint Set' : base >= 70 ? 'Endurance Swim' : 'Recovery Swim'
  return { pct: base, suggestion }
}

function computeSwimmingWeeklyTrend(activities: Activity[]) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const swims7 = activities.filter(a => isSwim(a) && a.start_date >= sevenDaysAgo)
  const swims14to7 = activities.filter(a => isSwim(a) && a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo)
  const meters7 = swims7.reduce((s, a) => s + (a.distance ?? 0), 0)
  const meters14to7 = swims14to7.reduce((s, a) => s + (a.distance ?? 0), 0)
  const metersPct = meters14to7 > 0 ? Math.round((meters7 - meters14to7) / meters14to7 * 100) : null
  const validPace = swims7.filter(a => a.average_speed && a.average_speed > 0)
  const avgPace7 = validPace.length
    ? formatPace100m(validPace.reduce((s, a) => s + (a.average_speed ?? 0), 0) / validPace.length)
    : null
  return { sessions7: swims7.length, meters7, metersPct, avgPace7 }
}

function buildSwimmingInsight(activities: Activity[], readinessPct?: number): string {
  if (!activities.some(isSwim)) return 'No swimming data yet. Log your first swim in Strava to see insights here.'
  const trend = computeSwimmingWeeklyTrend(activities)
  const pct = readinessPct ?? computeSwimmingReadiness(activities).pct
  const suggestion = pct >= 85 ? 'a sprint set' : pct >= 70 ? 'an endurance swim' : 'a recovery swim'
  let text = `Recovery at ${pct}% — ${suggestion} recommended today.`
  if (trend.meters7 > 0) {
    const km = (trend.meters7 / 1000).toFixed(1)
    text = `${km} km in the water this week. ` + text
  }
  if (trend.metersPct !== null && Math.abs(trend.metersPct) >= 15) {
    const dir = trend.metersPct > 0 ? `up ${trend.metersPct}%` : `down ${Math.abs(trend.metersPct)}%`
    text += ` Volume ${dir} vs last week.`
  }
  return text
}

function computeRunningVolumeHistory(activities: Activity[]) {
  return Array.from({ length: 4 }, (_, i) => {
    const weeksBack = 3 - i
    const start = new Date(Date.now() - (weeksBack + 1) * 7 * 86400000).toISOString()
    const end   = new Date(Date.now() -  weeksBack      * 7 * 86400000).toISOString()
    const week  = activities.filter(a => isRun(a) && a.start_date >= start && a.start_date < end)
    return {
      label: weeksBack === 0 ? 'This' : weeksBack === 1 ? 'Last' : `${weeksBack}w`,
      km: week.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000,
      runs: week.length,
    }
  })
}

function computeRunningHRTrend(activities: Activity[]) {
  const now = Date.now()
  const thirtyAgo = new Date(now - 30 * 86400000).toISOString()
  const fifteenAgo = new Date(now - 15 * 86400000).toISOString()
  const early = activities.filter(a => isRun(a) && a.average_heartrate && a.start_date >= thirtyAgo && a.start_date < fifteenAgo)
  const late  = activities.filter(a => isRun(a) && a.average_heartrate && a.start_date >= fifteenAgo)
  const avg = (arr: Activity[]) => arr.length
    ? Math.round(arr.reduce((s, a) => s + (a.average_heartrate ?? 0), 0) / arr.length)
    : null
  const earlyHR = avg(early), lateHR = avg(late)
  const avgHR30 = avg([...early, ...late])
  let trend = ''
  if (earlyHR && lateHR) {
    const diff = lateHR - earlyHR
    if (diff < -3) trend = `↓ ${Math.abs(diff)} bpm lower — aerobic efficiency improving`
    else if (diff > 3) trend = `↑ ${diff} bpm higher — higher effort or fatigue`
    else trend = 'Heart rate stable over last 30 days'
  }
  return { earlyHR, lateHR, avgHR30, trend }
}

function computeCyclingVolumeHistory(activities: Activity[]) {
  return Array.from({ length: 4 }, (_, i) => {
    const weeksBack = 3 - i
    const start = new Date(Date.now() - (weeksBack + 1) * 7 * 86400000).toISOString()
    const end   = new Date(Date.now() -  weeksBack      * 7 * 86400000).toISOString()
    const week  = activities.filter(a => isRide(a) && a.start_date >= start && a.start_date < end)
    return {
      label: weeksBack === 0 ? 'This' : weeksBack === 1 ? 'Last' : `${weeksBack}w`,
      km: week.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000,
      rides: week.length,
    }
  })
}

function computeCyclingHRTrend(activities: Activity[]) {
  const now = Date.now()
  const thirtyAgo = new Date(now - 30 * 86400000).toISOString()
  const fifteenAgo = new Date(now - 15 * 86400000).toISOString()
  const early = activities.filter(a => isRide(a) && a.average_heartrate && a.start_date >= thirtyAgo && a.start_date < fifteenAgo)
  const late  = activities.filter(a => isRide(a) && a.average_heartrate && a.start_date >= fifteenAgo)
  const avg = (arr: Activity[]) => arr.length
    ? Math.round(arr.reduce((s, a) => s + (a.average_heartrate ?? 0), 0) / arr.length)
    : null
  const earlyHR = avg(early), lateHR = avg(late)
  const avgHR30 = avg([...early, ...late])
  let trend = ''
  if (earlyHR && lateHR) {
    const diff = lateHR - earlyHR
    if (diff < -3) trend = `↓ ${Math.abs(diff)} bpm lower — cardiac efficiency improving`
    else if (diff > 3) trend = `↑ ${diff} bpm higher — higher effort or fatigue`
    else trend = 'Heart rate stable over last 30 days'
  }
  return { earlyHR, lateHR, avgHR30, trend }
}

function computeSwimmingVolumeHistory(activities: Activity[]) {
  return Array.from({ length: 4 }, (_, i) => {
    const weeksBack = 3 - i
    const start = new Date(Date.now() - (weeksBack + 1) * 7 * 86400000).toISOString()
    const end   = new Date(Date.now() -  weeksBack      * 7 * 86400000).toISOString()
    const week  = activities.filter(a => isSwim(a) && a.start_date >= start && a.start_date < end)
    return {
      label: weeksBack === 0 ? 'This' : weeksBack === 1 ? 'Last' : `${weeksBack}w`,
      meters: week.reduce((s, a) => s + (a.distance ?? 0), 0),
      sessions: week.length,
    }
  })
}

function computeSwimmingPaceTrend(activities: Activity[]) {
  const now = Date.now()
  const thirtyAgo = new Date(now - 30 * 86400000).toISOString()
  const fifteenAgo = new Date(now - 15 * 86400000).toISOString()
  const early = activities.filter(a => isSwim(a) && a.average_speed && a.start_date >= thirtyAgo && a.start_date < fifteenAgo)
  const late  = activities.filter(a => isSwim(a) && a.average_speed && a.start_date >= fifteenAgo)
  const avgSpd = (arr: Activity[]) => arr.length
    ? arr.reduce((s, a) => s + (a.average_speed ?? 0), 0) / arr.length
    : null
  const earlySpd = avgSpd(early), lateSpd = avgSpd(late)
  return {
    earlyPace: earlySpd ? formatPace100m(earlySpd) : null,
    latePace:  lateSpd  ? formatPace100m(lateSpd)  : null,
    improved:  earlySpd && lateSpd ? lateSpd > earlySpd : null,
  }
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

export function computeMuscleGroupAdvice(hevy: HevyWorkout[]): {
  label: string; recovery: number; weekLoad: number
  recommendation: 'train' | 'possible' | 'rest'
}[] {
  const groups = [
    { label: 'Legs',      keywords: ['squat', 'deadlift', 'leg press', 'lunge', 'rdl', 'hip thrust', 'calf', 'hamstring', 'quad', 'leg curl', 'leg extension'] },
    { label: 'Chest',     keywords: ['bench', 'push', 'fly', 'dip', 'chest'] },
    { label: 'Back',      keywords: ['row', 'pull-up', 'pullup', 'lat', 'deadlift', 'chin', 'cable row'] },
    { label: 'Shoulders', keywords: ['lateral raise', 'front raise', 'shoulder', 'overhead press', 'ohp', 'military press', 'upright row'] },
    { label: 'Arms',      keywords: ['curl', 'tricep', 'extension', 'hammer', 'bicep', 'preacher'] },
  ]
  const weekStart = startOfWeek()
  const weekHevy  = hevy.filter(h => h.start_time >= weekStart && !isAccessorySession(h))
  const sorted    = [...hevy].sort((a, b) => b.start_time.localeCompare(a.start_time))

  return groups.map(({ label, keywords }) => {
    let lastTrained: string | null = null
    for (const w of sorted) {
      if (!w.exercises) continue
      if (w.exercises.some(ex => keywords.some(k => (ex.title ?? '').toLowerCase().includes(k)))) {
        lastTrained = w.start_time; break
      }
    }
    const hoursSince = lastTrained ? (Date.now() - new Date(lastTrained).getTime()) / 3600000 : Infinity
    const recovery   = hoursSince < 24 ? 20 : hoursSince < 48 ? 55 : hoursSince < 72 ? 80 : 100

    let weekLoad = 0
    weekHevy.forEach(w => {
      ;(w.exercises ?? []).forEach(ex => {
        const t = (ex.title ?? '').toLowerCase()
        if (!keywords.some(k => t.includes(k))) return
        const intensity = setIntensityFactor(ex.sets ?? [])
        const base = COMPOUND_KEYWORDS.some(k => t.includes(k)) ? 1.0 : 0.6
        weekLoad += (ex.sets?.length ?? 0) * base * intensity
      })
    })

    const recommendation = recovery >= 80 ? 'train' : recovery >= 55 ? 'possible' : 'rest'
    return { label, recovery, weekLoad: Math.round(weekLoad * 10) / 10, recommendation }
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
    ? (avgSpd7 > avgSpd14to7 * 1.02 ? 'faster' : avgSpd7 < avgSpd14to7 * 0.98 ? 'slower' : 'stable')
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
  const thisWeekStart = startOfWeek()
  const lastWeekStart = new Date(new Date(thisWeekStart).getTime() - 7 * 86400000).toISOString()
  const hevyThis = hevy.filter(h => h.start_time >= thisWeekStart)
  const hevyLast = hevy.filter(h => h.start_time >= lastWeekStart && h.start_time < thisWeekStart)
  const vol7 = hevyThis.reduce((s, h) => s + (h.volume_kg ?? 0), 0)
  const volLast = hevyLast.reduce((s, h) => s + (h.volume_kg ?? 0), 0)
  const sets7 = hevyThis.reduce((s, h) => s + (h.sets ?? 0), 0)
  const setsLast = hevyLast.reduce((s, h) => s + (h.sets ?? 0), 0)
  const sessions7 = hevyThis.length
  const sessionsLast = hevyLast.length
  const pctDelta = (cur: number, prev: number) => prev > 0 ? Math.round((cur - prev) / prev * 100) : null
  // 6-week peak using calendar weeks
  const weeklyVols = Array.from({ length: 6 }, (_, w) => {
    const end = new Date(new Date(thisWeekStart).getTime() - w * 7 * 86400000).toISOString()
    const start = new Date(new Date(thisWeekStart).getTime() - (w + 1) * 7 * 86400000).toISOString()
    return hevy.filter(h => h.start_time >= start && h.start_time < end).reduce((s, h) => s + (h.volume_kg ?? 0), 0)
  })
  const maxWeeklyVol = weeklyVols.length > 0 ? Math.max(...weeklyVols) : 0
  const isHighestIn6Weeks = vol7 > 0 && maxWeeklyVol > 0 && vol7 >= maxWeeklyVol * 0.98
  return {
    vol7, sets7, sessions7,
    volumePct: pctDelta(vol7, volLast),
    setsPct: pctDelta(sets7, setsLast),
    sessionsPct: pctDelta(sessions7, sessionsLast),
    isHighestIn6Weeks,
  }
}

function computeMuscleDistribution(hevy: HevyWorkout[]) {
  const groups = [
    { label: 'Legs', keywords: ['squat', 'deadlift', 'leg press', 'lunge', 'rdl', 'hip thrust', 'calf', 'hamstring', 'quad', 'leg curl', 'leg extension'], color: '#4ade80' },
    { label: 'Chest', keywords: ['bench', 'push', 'fly', 'dip', 'chest'], color: '#60a5fa' },
    { label: 'Back', keywords: ['row', 'pull-up', 'pullup', 'lat', 'deadlift', 'chin', 'cable row'], color: '#2dd4bf' },
    { label: 'Shoulders', keywords: ['lateral raise', 'front raise', 'shoulder', 'overhead press', 'ohp', 'military press', 'upright row'], color: '#facc15' },
    { label: 'Arms', keywords: ['curl', 'tricep', 'extension', 'hammer', 'bicep', 'preacher'], color: '#fb923c' },
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

function computeVolumeHistory(hevy: HevyWorkout[]) {
  return Array.from({ length: 4 }, (_, i) => {
    const weeksBack = 3 - i
    const start = new Date(Date.now() - (weeksBack + 1) * 7 * 86400000).toISOString()
    const end   = new Date(Date.now() -  weeksBack      * 7 * 86400000).toISOString()
    const week  = hevy.filter(h => h.start_time >= start && h.start_time < end)
    return {
      label:    weeksBack === 0 ? 'This' : weeksBack === 1 ? 'Last' : `${weeksBack}w`,
      vol:      week.reduce((s, h) => s + (h.volume_kg ?? 0), 0),
      sessions: week.length,
    }
  })
}

function computeTopExercises(hevy: HevyWorkout[]) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const map: Record<string, { count: number; best1RM: number }> = {}
  hevy.filter(h => h.start_time >= monthStart.toISOString()).forEach(w => {
    ;(w.exercises ?? []).forEach(ex => {
      if (!map[ex.title]) map[ex.title] = { count: 0, best1RM: 0 }
      map[ex.title].count++
      ;(ex.sets ?? []).forEach(s => {
        const rm = epley1RM(s.weight_kg, s.reps)
        if (rm > map[ex.title].best1RM) map[ex.title].best1RM = rm
      })
    })
  })
  return Object.entries(map)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, d]) => ({ name, count: d.count, best1RM: d.best1RM }))
}

function computeWeeklySetBreakdown(hevy: HevyWorkout[]) {
  const groups = [
    { label: 'Legs',      keywords: ['squat', 'deadlift', 'leg press', 'lunge', 'rdl', 'hip thrust', 'calf', 'hamstring', 'quad', 'leg curl', 'leg extension'], color: '#4ade80' },
    { label: 'Chest',     keywords: ['bench', 'push', 'fly', 'dip', 'chest'],                                                                                    color: '#60a5fa' },
    { label: 'Back',      keywords: ['row', 'pull-up', 'pullup', 'lat', 'deadlift', 'chin', 'cable row'],                                                        color: '#2dd4bf' },
    { label: 'Shoulders', keywords: ['lateral raise', 'front raise', 'shoulder', 'overhead press', 'ohp', 'military press', 'upright row'],                      color: '#facc15' },
    { label: 'Arms',      keywords: ['curl', 'tricep', 'extension', 'hammer', 'bicep', 'preacher'],                                                              color: '#fb923c' },
  ]
  const wk = startOfWeek()
  const counts: Record<string, number> = {}
  hevy.filter(h => h.start_time >= wk).forEach(w => {
    ;(w.exercises ?? []).forEach(ex => {
      const t = (ex.title ?? '').toLowerCase()
      for (const g of groups) {
        if (g.keywords.some(k => t.includes(k))) { counts[g.label] = (counts[g.label] ?? 0) + (ex.sets?.length ?? 0); break }
      }
    })
  })
  return groups.filter(g => counts[g.label] > 0).map(g => ({ ...g, sets: counts[g.label] }))
}

function computeTrainingStreak(hevy: HevyWorkout[]) {
  const days = new Set(hevy.map(h => h.start_time.split('T')[0]))
  const today = new Date()
  let streak = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    if (days.has(d.toISOString().split('T')[0])) streak++
    else if (streak > 0 || i > 0) break
  }
  return { streak, totalDays: days.size, totalWorkouts: hevy.length }
}

// ─── AI Insight builders ──────────────────────────────────────────────────────

function buildOverviewInsight(activities: Activity[], hevy: HevyWorkout[], calendarEvents: any[]): string {
  const { loadRatio } = computePerformanceScore(activities, hevy)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const todayStr    = new Date().toISOString().slice(0, 10)
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const nowStr      = new Date().toISOString()

  const sportKw = ['push','pull','legs','squat','gym','kracht','strength','bench','deadlift','hyrox',
    'run','loop','hardloop','ride','fiet','cycl','bike','swim','zwem','interval','tempo','training','workout','sport']
  const isSportEv = (e: any) => sportKw.some(k => (e.title ?? '').toLowerCase().includes(k))

  const todayEvts = (calendarEvents ?? [])
    .filter((e: any) => (e.start_datetime || e.start_date).slice(0, 10) === todayStr
      && (e.start_datetime || e.start_date) >= nowStr && isSportEv(e))
    .sort((a: any, b: any) => (a.start_datetime || a.start_date).localeCompare(b.start_datetime || b.start_date))
  const tomorrowEvts = (calendarEvents ?? [])
    .filter((e: any) => (e.start_datetime || e.start_date).slice(0, 10) === tomorrowStr && isSportEv(e))
    .sort((a: any, b: any) => (a.start_datetime || a.start_date).localeCompare(b.start_datetime || b.start_date))

  const weekRuns     = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo).length
  const weekStrength = hevy.filter(h => h.start_time >= sevenDaysAgo).length
  const weekKm       = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const loadPct      = Math.round((loadRatio - 1) * 100)

  // High load — reference specific upcoming sessions
  if (loadRatio > 1.3) {
    if (todayEvts.length > 0 && tomorrowEvts.length > 0)
      return `${todayEvts[0].title} is planned for today. With current training load (+${loadPct}%), a lighter session can improve recovery for ${tomorrowEvts[0].title} tomorrow.`
    if (todayEvts.length > 0)
      return `${todayEvts[0].title} is planned for today. Training load is +${loadPct}% above baseline — consider adjusting intensity.`
    if (tomorrowEvts.length > 0)
      return `${tomorrowEvts[0].title} is planned for tomorrow. A recovery day today increases the chance of a quality session (+${loadPct}% current load).`
    return `Training load is +${loadPct}% above baseline. A lighter day can aid recovery.`
  }

  // No activity yet this week
  if (weekRuns === 0 && weekStrength === 0) {
    if (todayEvts.length > 0)
      return `${todayEvts[0].title} is planned for today — good time to start the week. Consistency builds the best long-term results.`
    return 'No sessions yet this week. Even a short workout maintains fitness — consistency matters more than intensity.'
  }

  // Back-to-back planned sessions
  if (todayEvts.length > 0 && tomorrowEvts.length > 0)
    return `${todayEvts[0].title} today, ${tomorrowEvts[0].title} tomorrow — busy schedule. Make sure to get adequate recovery and nutrition between sessions.`

  // Normal summary with planning context
  const parts: string[] = []
  if (weekRuns > 0) parts.push(`${weekRuns}× running${weekKm > 0 ? ` (${weekKm.toFixed(1)} km)` : ''}`)
  if (weekStrength > 0) parts.push(`${weekStrength}× strength`)
  const summary = parts.join(' and ') + ' this week.'
  if (todayEvts.length > 0) return `${summary} ${todayEvts[0].title} still planned for today.`
  if (tomorrowEvts.length > 0) return `${summary} ${tomorrowEvts[0].title} planned for tomorrow — get ready.`
  return summary
}

function buildRunningInsight(activities: Activity[], readinessPct?: number): string {
  const runs = activities.filter(isRun)
  if (runs.length === 0) return 'No running data yet. Log your first run to see insights here.'
  const trend = computeRunning7DayTrend(activities)
  const pct = readinessPct ?? computeRunningReadiness(activities).pct
  const suggestion = pct >= 85 ? 'a tempo run' : pct >= 70 ? 'an easy run' : 'a rest day'
  if (trend.volPct !== null && Math.abs(trend.volPct) >= 15) {
    const dir = trend.volPct > 0 ? `up ${trend.volPct}% vs last week` : `down ${Math.abs(trend.volPct)}% vs last week`
    return `Running volume ${dir}. Recovery at ${pct}% — ${suggestion} recommended today.`
  }
  const kmPart = trend.vol7 > 0 ? `${trend.vol7.toFixed(1)} km this week` : ''
  const pacePart = trend.avgPace7 ? ` at avg ${trend.avgPace7}/km` : ''
  return `Recovery at ${pct}%.${kmPart ? ` ${kmPart}${pacePart}.` : ''} Recommended today: ${suggestion}.`
}

function buildCyclingInsight(activities: Activity[], readinessPct?: number): string {
  if (!activities.some(isRide)) return 'No cycling data yet. Connect Strava for automatic sync.'
  const trend = computeCyclingWeeklyTrend(activities)
  const ftp = computeFTP(activities)
  const pct = readinessPct ?? computeCyclingReadiness(activities).pct
  const suggestion = pct >= 85 ? 'a threshold session' : pct >= 70 ? 'a Zone 2 ride' : 'a recovery ride'
  let text = `Recovery at ${pct}% — ${suggestion} recommended today.`
  if (trend.km7 > 0) text = `${trend.km7.toFixed(0)} km on the bike this week. ` + text
  if (ftp) text += ` Estimated FTP: ${ftp}W.`
  return text
}

function buildStrengthInsight(hevy: HevyWorkout[]): string {
  if (hevy.length === 0) return 'No strength data yet. Connect Hevy to track your workouts automatically.'
  const progress = computeStrengthProgress(hevy)
  if (progress.sessions7 === 0) return 'No strength sessions this week. Check which muscle groups are recovered and plan your next lift.'
  const lifts = extractKeyLifts(hevy)
  const trending = lifts.find(l => l.trend.includes('↑'))
  const allRecovery = computeMuscleRecovery(hevy)
  const fullyRested = allRecovery.filter(g => g.recovery >= 90)
  const stillRecovering = allRecovery.filter(g => g.recovery < 60)
  const parts: string[] = []
  if (progress.isHighestIn6Weeks) {
    parts.push('Highest training volume in 6 weeks.')
  } else if (progress.volumePct !== null) {
    if (progress.volumePct >= 15) parts.push(`Volume up ${progress.volumePct}% vs last week — solid progressive overload.`)
    else if (progress.volumePct <= -15) parts.push(`Volume down ${Math.abs(progress.volumePct)}% vs last week.`)
  }
  if (trending) parts.push(`${trending.name} trending up (${trending.trend}).`)
  if (fullyRested.length > 0 && stillRecovering.length > 0) {
    parts.push(`${fullyRested.slice(0, 2).map(g => g.label).join(' and ')} ready — ${stillRecovering[0].label.toLowerCase()} still recovering.`)
  } else if (fullyRested.length > 0) {
    parts.push(`${fullyRested.map(g => g.label).join(', ')} fully recovered. Good time to push.`)
  } else if (stillRecovering.length > 0) {
    parts.push(`${stillRecovering.map(g => g.label).join(' and ')} still recovering — consider a rest day or a different muscle group.`)
  }
  return parts.length > 0 ? parts.join(' ') : `${progress.sessions7} session${progress.sessions7 !== 1 ? 's' : ''} this week. Stay consistent.`
}

type InsightBadge = { emoji: string; text: string }

function buildTopInsights(
  activities: Activity[],
  hevy: HevyWorkout[],
  gezondheid: { datum: string; stappen: number; gewicht: number }[] | null
): InsightBadge[] {
  const badges: InsightBadge[] = []
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
      badges.push(pct > 0 ? { emoji: '📈', text: `Run volume +${pct}%` } : { emoji: '📉', text: `Run volume -${Math.abs(pct)}%` })
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
    badges.push({ emoji: '📉', text: `Weight ${weightDelta.toFixed(1)} kg` })
  }

  // High strength frequency
  const weekStrength = hevy.filter(h => h.start_time >= weekStart).length
  const allTimes = [...activities.map(a => a.start_date), ...hevy.map(h => h.start_time)].sort().reverse()
  const hoursSinceLast = allTimes.length ? (Date.now() - new Date(allTimes[0]).getTime()) / 3600000 : null
  const recPct = hoursSinceLast !== null ? (hoursSinceLast < 12 ? 45 : hoursSinceLast < 24 ? 65 : hoursSinceLast < 48 ? 82 : 95) : 95
  if (weekStrength >= 4 && recPct < 70 && badges.length < 3) {
    badges.push({ emoji: '⚠️', text: `Recovery low (${weekStrength}x strength)` })
  }

  // Low load
  if (loadRatio < 0.6 && activities.length > 0 && badges.length < 3) {
    badges.push({ emoji: '📉', text: 'Load low vs last week' })
  }

  // Building + stable weight
  const earlyKjCheck = activities.filter(a => a.start_date >= thirtyDaysAgo && a.start_date < fifteenDaysAgo).reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const lateKjCheck = activities.filter(a => a.start_date >= fifteenDaysAgo).reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const loadTrendPct = earlyKjCheck > 0 ? (lateKjCheck - earlyKjCheck) / earlyKjCheck * 100 : 0
  if (loadTrendPct > 10 && weightDelta !== null && Math.abs(weightDelta) < 0.2 && badges.length < 3) {
    badges.push({ emoji: '📈', text: 'Volume rising, weight stable' })
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
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">Coach Tip</span>
        </div>
        <p className="text-[17px] text-white/85 leading-relaxed" suppressHydrationWarning>{text}</p>
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
  const label = readiness.pct >= 85 ? 'Optimal' : readiness.pct >= 70 ? 'Ready to train' : 'Slightly fatigued'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Running Readiness</span>
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[40px] font-bold text-white leading-none">{readiness.pct}%</span>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-[15px] font-semibold" style={{ color: c }}>{label}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 pb-1">
            <span className="text-[12px] text-white/40">Recommended today</span>
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

function RunListItem({ a, isLast }: { a: Activity; isLast: boolean }) {
  const pace = a.average_speed ? formatPace(a.average_speed) : null
  const dist = a.distance ? `${(a.distance / 1000).toFixed(2)} km` : null
  const dur = a.moving_time ? formatDuration(a.moving_time) : null
  return (
    <div className="py-4 flex flex-col gap-1.5" style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex flex-col gap-0.5">
        <span className="text-[16px] font-semibold text-white leading-tight">{a.name}</span>
        <span className="text-[12px] text-white/40">{formatDate(a.start_date)}</span>
      </div>
      <div className="flex gap-4 flex-wrap">
        {dist && <span className="text-[13px] text-white/70">{dist}</span>}
        {pace && <span className="text-[13px] font-semibold text-teal-400">{pace} /km</span>}
        {dur && <span className="text-[13px] text-white/60">{dur}</span>}
        {a.average_heartrate && <span className="text-[13px] font-semibold text-red-400">{Math.round(a.average_heartrate)} bpm</span>}
      </div>
    </div>
  )
}

function LastRunCard({ run, allRuns }: { run: Activity; allRuns: Activity[] }) {
  const [showAll, setShowAll] = useState(false)
  const pace = run.average_speed ? formatPace(run.average_speed) : null
  const dist = run.distance ? `${(run.distance / 1000).toFixed(2)} km` : null
  const dur = run.moving_time ? formatDuration(run.moving_time) : null
  return (
    <>
      {showAll && (
        <div className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between px-5 py-4 shrink-0">
            <button onClick={() => setShowAll(false)}
              className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.10)' }}>
              Back
            </button>
            <span className="text-[17px] font-semibold text-white">Runs</span>
            <div className="w-[70px]" />
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-12" style={{ scrollbarWidth: 'none' }}>
            {allRuns.map((a, i) => <RunListItem key={a.id} a={a} isLast={i === allRuns.length - 1} />)}
          </div>
        </div>
      )}
      <button className="w-full text-left" onClick={() => setShowAll(true)}>
        <Card>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Last run</span>
              <span className="text-[12px] text-white/30">View all →</span>
            </div>
            <span className="text-[17px] font-semibold text-white leading-snug">{run.name}</span>
            <span className="text-[12px] text-white/40">{formatDate(run.start_date)}</span>
            <div className="flex gap-5 mt-1">
              {dist && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-white leading-none">{dist}</span><span className="text-[11px] text-white/40">Distance</span></div>}
              {pace && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-teal-400 leading-none">{pace}</span><span className="text-[11px] text-white/40">Pace /km</span></div>}
              {dur && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-white leading-none">{dur}</span><span className="text-[11px] text-white/40">Duration</span></div>}
            </div>
            {run.average_heartrate && (
              <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2">
                <span className="text-[13px] text-white/40">Avg HR</span>
                <span className="text-[13px] font-semibold text-red-400">{Math.round(run.average_heartrate)} bpm</span>
              </div>
            )}
          </div>
        </Card>
      </button>
    </>
  )
}

function RunningTrendCard({ trend }: { trend: ReturnType<typeof computeRunning7DayTrend> }) {
  const volSign = (trend.volPct ?? 0) > 0 ? '+' : ''
  const volColor = (trend.volPct ?? 0) > 10 ? '#4ade80' : (trend.volPct ?? 0) < -10 ? '#f87171' : 'rgba(255,255,255,0.5)'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">7-Day Overview</span>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-bold text-white leading-none">{trend.vol7 > 0 ? `${trend.vol7.toFixed(1)}` : '–'}</span>
            <span className="text-[11px] text-white/40">km</span>
            {trend.volPct !== null && (
              <span className="text-[12px] font-semibold" style={{ color: volColor }}>{volSign}{trend.volPct}% vs last week</span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-bold text-teal-400 leading-none">{trend.avgPace7 ?? '–'}</span>
            <span className="text-[11px] text-white/40">gem. /km</span>
            {trend.paceDir && <span className="text-[12px] text-white/40">{trend.paceDir} vs last week</span>}
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
  const label = readiness.pct >= 85 ? 'Optimal' : readiness.pct >= 70 ? 'Ready to train' : 'Slightly fatigued'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Cycling Readiness</span>
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[40px] font-bold text-white leading-none">{readiness.pct}%</span>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-[15px] font-semibold" style={{ color: c }}>{label}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 pb-1">
            <span className="text-[12px] text-white/40">Recommended today</span>
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

function RideListItem({ a, isLast }: { a: Activity; isLast: boolean }) {
  const speed = a.average_speed ? `${(a.average_speed * 3.6).toFixed(1)} km/h` : null
  const dist = a.distance ? `${(a.distance / 1000).toFixed(1)} km` : null
  const dur = a.moving_time ? formatDuration(a.moving_time) : null
  const elev = a.total_elevation_gain ? `${Math.round(a.total_elevation_gain)} m ↑` : null
  return (
    <div className="py-4 flex flex-col gap-1.5" style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex flex-col gap-0.5">
        <span className="text-[16px] font-semibold text-white leading-tight">{a.name}</span>
        <span className="text-[12px] text-white/40">{formatDate(a.start_date)}</span>
      </div>
      <div className="flex gap-4 flex-wrap">
        {dist && <span className="text-[13px] text-white/70">{dist}</span>}
        {speed && <span className="text-[13px] font-semibold text-cyan-400">{speed}</span>}
        {dur && <span className="text-[13px] text-white/60">{dur}</span>}
        {elev && <span className="text-[13px] text-white/50">{elev}</span>}
        {a.average_heartrate && <span className="text-[13px] font-semibold text-red-400">{Math.round(a.average_heartrate)} bpm</span>}
      </div>
    </div>
  )
}

function LastRideCard({ ride, allRides }: { ride: Activity; allRides: Activity[] }) {
  const [showAll, setShowAll] = useState(false)
  const speed = ride.average_speed ? `${(ride.average_speed * 3.6).toFixed(1)} km/h` : null
  const dist = ride.distance ? `${(ride.distance / 1000).toFixed(1)} km` : null
  const dur = ride.moving_time ? formatDuration(ride.moving_time) : null
  const elev = ride.total_elevation_gain ? `${Math.round(ride.total_elevation_gain)} m` : null
  return (
    <>
      {showAll && (
        <div className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between px-5 py-4 shrink-0">
            <button onClick={() => setShowAll(false)}
              className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.10)' }}>
              Back
            </button>
            <span className="text-[17px] font-semibold text-white">Ritten</span>
            <div className="w-[70px]" />
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-12" style={{ scrollbarWidth: 'none' }}>
            {allRides.map((a, i) => <RideListItem key={a.id} a={a} isLast={i === allRides.length - 1} />)}
          </div>
        </div>
      )}
      <button className="w-full text-left" onClick={() => setShowAll(true)}>
        <Card>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Last ride</span>
              <span className="text-[12px] text-white/30">View all →</span>
            </div>
            <span className="text-[17px] font-semibold text-white leading-snug">{ride.name}</span>
            <span className="text-[12px] text-white/40">{formatDate(ride.start_date)}</span>
            <div className="flex gap-5 mt-1">
              {dist && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-white leading-none">{dist}</span><span className="text-[11px] text-white/40">Distance</span></div>}
              {speed && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-cyan-400 leading-none">{speed}</span><span className="text-[11px] text-white/40">Pace</span></div>}
              {dur && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-white leading-none">{dur}</span><span className="text-[11px] text-white/40">Duration</span></div>}
              {elev && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-orange-400 leading-none">{elev}</span><span className="text-[11px] text-white/40">Elevation</span></div>}
            </div>
            {ride.average_heartrate && (
              <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2">
                <span className="text-[13px] text-white/40">Avg HR</span>
                <span className="text-[13px] font-semibold text-red-400">{Math.round(ride.average_heartrate)} bpm</span>
              </div>
            )}
          </div>
        </Card>
      </button>
    </>
  )
}

function CyclingWeeklyTrendCard({ trend }: { trend: ReturnType<typeof computeCyclingWeeklyTrend> }) {
  const kmSign = (trend.kmPct ?? 0) > 0 ? '+' : ''
  const kmColor = (trend.kmPct ?? 0) > 10 ? '#4ade80' : (trend.kmPct ?? 0) < -10 ? '#f87171' : 'rgba(255,255,255,0.5)'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">This Week</span>
        <div className="grid grid-cols-4 gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[20px] font-bold text-white leading-none">{trend.km7 > 0 ? `${trend.km7.toFixed(0)}` : '–'}</span>
            <span className="text-[11px] text-white/40">km</span>
            {trend.kmPct !== null && <span className="text-[11px] font-semibold" style={{ color: kmColor }}>{kmSign}{trend.kmPct}% vs last week</span>}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[20px] font-bold text-white leading-none">{trend.dur7 > 0 ? formatDuration(trend.dur7) : '–'}</span>
            <span className="text-[11px] text-white/40">duration</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[20px] font-bold text-orange-400 leading-none">{trend.elev7 > 0 ? `${Math.round(trend.elev7)}` : '–'}</span>
            <span className="text-[11px] text-white/40">m elev</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[20px] font-bold text-cyan-400 leading-none">{trend.rideCount}</span>
            <span className="text-[11px] text-white/40">rides</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function StrengthProgressCard({ progress }: { progress: ReturnType<typeof computeStrengthProgress> }) {
  const delta = (pct: number | null) => {
    if (pct === null) return ''
    return pct > 0 ? `↑ +${pct}%` : pct < 0 ? `↓ ${pct}%` : '→ stable'
  }
  const dColor = (pct: number | null) => {
    if (pct === null) return 'rgba(255,255,255,0.3)'
    return pct > 5 ? '#4ade80' : pct < -5 ? '#f87171' : 'rgba(255,255,255,0.5)'
  }
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">This Week's Progress</span>
          {progress.isHighestIn6Weeks && (
            <span className="text-[11px] font-semibold text-teal-400 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(45,212,191,0.12)' }}>
              Best in 6 weeks
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Volume', value: progress.vol7 > 0 ? `${Math.round(progress.vol7).toLocaleString('en-US')}` : '–', unit: 'kg', pct: progress.volumePct },
            { label: 'Sets', value: `${progress.sets7 || '–'}`, unit: '', pct: progress.setsPct },
            { label: 'Sessions', value: `${progress.sessions7 || '–'}`, unit: '', pct: progress.sessionsPct },
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
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Muscle Distribution</span>
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

function WorkoutListItem({ w, isLast }: { w: HevyWorkout; isLast: boolean }) {
  const [open, setOpen] = useState(false)
  const exList = w.exercises ?? []
  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
      <button className="w-full text-left py-4 flex flex-col gap-2" onClick={() => exList.length > 0 && setOpen(o => !o)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-[16px] font-semibold text-white leading-tight truncate">{w.title}</span>
            <span className="text-[12px] text-white/40">{formatDate(w.start_time)}</span>
          </div>
          {exList.length > 0 && (
            <span className="text-white/30 text-[13px] shrink-0 mt-0.5">{open ? '▲' : '▼'}</span>
          )}
        </div>
        <div className="flex gap-4">
          {(w.duration ?? 0) > 0 && <span className="text-[13px] text-white/60">{formatDuration(w.duration!)}</span>}
          {(w.volume_kg ?? 0) > 0 && <span className="text-[13px] font-semibold text-orange-400">{Math.round(w.volume_kg!).toLocaleString('en-US')} kg</span>}
          {(w.sets ?? 0) > 0 && <span className="text-[13px] text-white/60">{w.sets} sets</span>}
        </div>
      </button>
      {open && exList.length > 0 && (
        <div className="pb-4 flex flex-col gap-3">
          {exList.map(ex => (
            <div key={ex.title} className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-white/80">{ex.title}</span>
              <div className="flex flex-wrap gap-1.5">
                {ex.sets.map((s, i) => (
                  <span key={i} className="text-[12px] px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>
                    {s.weight_kg > 0 ? `${s.weight_kg} kg × ${s.reps}` : `${s.reps} reps`}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LastStrengthWorkoutCard({ workout, allWorkouts }: { workout: HevyWorkout; allWorkouts: HevyWorkout[] }) {
  const [showAll, setShowAll] = useState(false)
  const exList = (workout.exercises ?? []).slice(0, 5)

  return (
    <>
      {showAll && (
        <div className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between px-5 py-4 shrink-0">
            <button onClick={() => setShowAll(false)}
              className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.10)' }}>
              Back
            </button>
            <span className="text-[17px] font-semibold text-white">Trainingen</span>
            <div className="w-[70px]" />
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-12" style={{ scrollbarWidth: 'none' }}>
            {allWorkouts.map((w, i) => (
              <WorkoutListItem key={w.id} w={w} isLast={i === allWorkouts.length - 1} />
            ))}
          </div>
        </div>
      )}

      <button className="w-full text-left" onClick={() => setShowAll(true)}>
        <Card>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Last training</span>
              <span className="text-[12px] text-white/30">View all →</span>
            </div>
            <span className="text-[17px] font-semibold text-white leading-snug">{workout.title}</span>
            <span className="text-[12px] text-white/40">{formatDate(workout.start_time)}</span>
            <div className="flex gap-5 mt-1">
              {(workout.duration ?? 0) > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[20px] font-bold text-white leading-none">{formatDuration(workout.duration!)}</span>
                  <span className="text-[11px] text-white/40">Duration</span>
                </div>
              )}
              {(workout.volume_kg ?? 0) > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[20px] font-bold text-orange-400 leading-none">{Math.round(workout.volume_kg!).toLocaleString('en-US')} kg</span>
                  <span className="text-[11px] text-white/40">Volume</span>
                </div>
              )}
              {(workout.sets ?? 0) > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[20px] font-bold text-white leading-none">{workout.sets}</span>
                  <span className="text-[11px] text-white/40">Sets</span>
                </div>
              )}
            </div>
            {exList.length > 0 && (
              <div className="pt-2 border-t border-white/[0.06] flex flex-wrap gap-1.5">
                {exList.map(ex => (
                  <span key={ex.title} className="text-[12px] font-medium px-2 py-0.5 rounded-full"
                    style={{ color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.07)' }}>
                    {ex.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      </button>
    </>
  )
}

function VolumeHistoryCard({ weeks }: { weeks: ReturnType<typeof computeVolumeHistory> }) {
  const maxVol = Math.max(...weeks.map(w => w.vol), 1)
  const thisWeek = weeks[weeks.length - 1]
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">4-Week Volume</span>
        <div className="flex items-end gap-2" style={{ height: 64 }}>
          {weeks.map((w, i) => {
            const isThis = i === weeks.length - 1
            const barH = w.vol > 0 ? Math.max(8, Math.round((w.vol / maxVol) * 52)) : 4
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] font-semibold" style={{ color: isThis ? '#fb923c' : 'rgba(255,255,255,0.3)' }}>
                  {w.vol > 0 ? `${Math.round(w.vol / 100) / 10}k` : '–'}
                </span>
                <div className="w-full rounded-[6px]"
                  style={{ height: barH, background: isThis ? '#fb923c' : 'rgba(255,255,255,0.15)' }} />
                <span className="text-[10px] text-white/35">{w.label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-[12px] pt-1 border-t border-white/[0.06]">
          <span className="text-white/40">{thisWeek.sessions} session{thisWeek.sessions !== 1 ? 's' : ''} this week</span>
          <span className="font-semibold text-orange-400">{Math.round(thisWeek.vol).toLocaleString('en-US')} kg</span>
        </div>
      </div>
    </Card>
  )
}

function TopExercisesCard({ exercises }: { exercises: ReturnType<typeof computeTopExercises> }) {
  if (exercises.length === 0) return null
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Most This Month</span>
        {exercises.map((ex, i) => (
          <div key={ex.name} className="flex items-center gap-3">
            <span className="text-[13px] font-bold text-white/20 w-4 shrink-0 text-center">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-white truncate">{ex.name}</p>
              <p className="text-[12px] text-white/40">{ex.count}× this month</p>
            </div>
            {ex.best1RM > 0 && (
              <div className="text-right shrink-0">
                <p className="text-[15px] font-semibold text-orange-400">{Math.round(ex.best1RM)} kg</p>
                <p className="text-[11px] text-white/30">gesch. 1RM</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function WeeklySetBreakdownCard({ breakdown }: { breakdown: ReturnType<typeof computeWeeklySetBreakdown> }) {
  if (breakdown.length === 0) return null
  const maxSets = Math.max(...breakdown.map(g => g.sets))
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Sets this week</span>
        {breakdown.map(g => (
          <div key={g.label} className="flex items-center gap-3">
            <span className="text-[14px] text-white w-[76px] shrink-0">{g.label}</span>
            <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${(g.sets / maxSets) * 100}%`, background: g.color }} />
            </div>
            <span className="text-[13px] font-semibold w-14 text-right shrink-0" style={{ color: g.color }}>{g.sets} sets</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function TrainingStreakCard({ data }: { data: ReturnType<typeof computeTrainingStreak> }) {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Training Activity</span>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[28px] font-bold text-teal-400 leading-none">{data.streak}</span>
            <span className="text-[11px] text-white/40">day streak</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[28px] font-bold text-white leading-none">{data.totalDays}</span>
            <span className="text-[11px] text-white/40">active days</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[28px] font-bold text-white leading-none">{data.totalWorkouts}</span>
            <span className="text-[11px] text-white/40">workouts</span>
          </div>
        </div>
        <span className="text-[12px] text-white/30">Past 30 days</span>
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

type TodaysFocus = {
  emoji: string; label: string
  action: string; actionColor: string
  reasons: string[]
}

function computeTodaysFocus(
  activities: Activity[],
  hevy: HevyWorkout[],
  calendarEvents: any[],
  recoveryPct: number,
  perf: { score: number; label: string; color: string; loadRatio: number },
  acwrDetail: ACWRDetail,
  rampRate: number | null,
): TodaysFocus {
  const todayStr    = new Date().toISOString().slice(0, 10)
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const day2Str     = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
  const day3Str     = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const events      = calendarEvents ?? []

  const ACT = {
    proceed:  { action: 'Stay the course',   actionColor: '#4ade80' },
    easier:   { action: 'Train lighter',     actionColor: '#facc15' },
    shorten:  { action: 'Train shorter',     actionColor: '#fb923c' },
    recover:  { action: 'Recovery day',      actionColor: '#2dd4bf' },
    moveTmr:  { action: 'Move to tomorrow',  actionColor: '#fb923c' },
    skip:     { action: 'Recovery day',      actionColor: '#2dd4bf' },
  } as const

  type Intensity = 'zone2' | 'easy' | 'moderate' | 'hard' | 'very_hard'
  const EFFORT: Record<Intensity, number> = { zone2: 0.20, easy: 0.35, moderate: 0.55, hard: 0.75, very_hard: 0.95 }
  // Effort multiplier per action — drives action-aware tomorrow prediction
  const ACT_MOD: Record<keyof typeof ACT, number> = {
    proceed: 1.0, easier: 0.50, shorten: 0.35, recover: 0.20, moveTmr: 0.05, skip: 0.0,
  }

  const rampHigh     = rampRate !== null && rampRate > 30
  const rampElevated = rampRate !== null && rampRate > 15

  // Per-sport ACWR risk weighted by each sport's share of total 28-day load.
  // A newly introduced sport with small load contribution does not dominate global risk.
  // Confidence shrinkage still applies to the per-sport ACWR value itself.
  function weightedACWRRisk(): number {
    const active = acwrDetail.sports.filter(s => s.acwr !== null && s.acuteLoad > 0)
    if (active.length === 0) return 0
    const totalLoad = active.reduce((sum, sp) => sum + sp.acuteLoad, 0)
    if (totalLoad === 0) return 0
    let risk = 0
    for (const sp of active) {
      if (sp.acwr === null) continue
      const eff = sp.confidence === 'high'   ? sp.acwr
        : sp.confidence === 'medium' ? 1.0 + (sp.acwr - 1.0) * 0.75
        : /* low */                    1.0 + (sp.acwr - 1.0) * 0.50
      risk += Math.max(0, eff - 1.0) * (sp.acuteLoad / totalLoad)
    }
    return risk
  }

  // Sport-aware ramp: penalty depends on what fraction of elevated load comes from new vs established sports.
  // elevatedSports:    sports above ACWR 1.2 with recent acute load
  // rampAllEstablished: no new sport contributing elevated load (or no elevated sports at all → treat as established)
  // rampMostlyNew:     >50% of elevated acute load is from newly introduced sports
  const elevatedSports     = acwrDetail.sports.filter(s => s.acwr !== null && s.acwr > 1.2 && s.acuteLoad > 0 && s.hasPrimaryLoad)
  const totalElevatedLoad  = elevatedSports.reduce((sum, s) => sum + s.acuteLoad, 0)
  const newElevatedLoad    = elevatedSports.filter(s => s.isNew).reduce((sum, s) => sum + s.acuteLoad, 0)
  const rampAllEstablished = elevatedSports.length === 0
    || (newElevatedLoad === 0 && elevatedSports.every(s => s.daysWithData >= 10))
  const rampMostlyNew      = totalElevatedLoad > 0 && newElevatedLoad / totalElevatedLoad > 0.50

  // Consecutive training days (days before today with a workout)
  const todayMs = new Date().setHours(0, 0, 0, 0)
  const trainedDates = new Set([
    ...activities.map(a => a.start_date.slice(0, 10)),
    ...hevy.map(h => h.start_time.slice(0, 10)),
  ])
  let consecutiveDays = 0
  for (let i = 1; i <= 7; i++) {
    if (trainedDates.has(new Date(todayMs - i * 86400000).toISOString().slice(0, 10))) consecutiveDays++
    else break
  }

  // Most recent workout timestamp — used for concrete reason bullets
  const allWorkoutTimes = [...activities.map(a => a.start_date), ...hevy.map(h => h.start_time)].sort().reverse()
  const lastWorkoutHoursAgo = allWorkoutTimes.length
    ? Math.round((Date.now() - new Date(allWorkoutTimes[0]).getTime()) / 3600000)
    : null

  function evtDate(e: any)  { return (e.start_datetime || e.start_date).slice(0, 10) }
  function evtTime(e: any)  { return e.start_datetime ? ` · ${formatClockTime(e.start_datetime)}` : '' }

  function sportEmoji(title: string): string {
    const t = title.toLowerCase()
    if (t.includes('hyrox')) return '🏋️'
    if (['push','pull','legs','squat','gym','kracht','strength','bench','deadlift'].some(k => t.includes(k))) return '💪'
    if (['run','loop','hardloop','tempo','interval'].some(k => t.includes(k))) return '🏃'
    if (['ride','fiet','cycl','bike','cycling'].some(k => t.includes(k)))      return '🚴'
    if (['swim','zwem'].some(k => t.includes(k)))  return '🏊'
    return '📅'
  }

  function isSportEvt(e: any): boolean {
    const t = (e.title ?? '').toLowerCase()
    return ['push','pull','legs','squat','gym','kracht','strength','bench','deadlift','hyrox',
            'run','loop','hardloop','ride','fiet','cycl','bike','swim','zwem','interval',
            'tempo','training','workout','sport'].some(k => t.includes(k))
  }

  function classify(title: string): Intensity {
    const t = title.toLowerCase()
    if (['zone 2','zone2','recovery','easy'].some(k => t.includes(k))) return 'zone2'
    if (['easy','long run','lsd'].some(k => t.includes(k)))                         return 'easy'
    if (t.includes('hyrox') || t.includes('wedstrijd') || t.includes('race'))       return 'very_hard'
    if (['interval','tempo','threshold'].some(k => t.includes(k)))                  return 'hard'
    if (['push','pull','legs','squat','gym','kracht','strength','bench','deadlift'].some(k => t.includes(k))) return 'hard'
    if (['run','loop','hardloop','ride','fiet','cycl'].some(k => t.includes(k)))     return 'moderate'
    return 'moderate'
  }

  function predictTomorrow(intensity: Intensity, actKey: keyof typeof ACT): number {
    const effectiveEffort = EFFORT[intensity] * ACT_MOD[actKey]
    const currentFatigue  = (95 - recoveryPct) / 28
    const decay24h        = Math.exp(-24 * Math.LN2 / 36)
    return Math.min(95, Math.max(20, Math.round(95 - decay24h * (currentFatigue + effectiveEffort) * 28)))
  }

  const loadPct  = Math.round((perf.loadRatio - 1) * 100)
  const highLoad = perf.loadRatio > 1.4
  const medLoad  = perf.loadRatio > 1.2

  // Multi-factor risk score — drives recommendation escalation
  function riskScore(): number {
    let s = 0
    if      (recoveryPct < 45)  s += 3
    else if (recoveryPct < 60)  s += 2
    else if (recoveryPct < 70)  s += 1
    else if (recoveryPct > 90)  s -= 2  // Exceptional recovery — offsets elevated ACWR / ramp / consecutive days
    else if (recoveryPct > 85)  s -= 1  // Strong recovery — partially offsets other risk factors
    // Per-sport weighted ACWR risk, weighted by load share
    const ar = weightedACWRRisk()
    if (ar >= 0.55) s += 3       // weighted ACWR ≥ 1.55 (dominant sport very high)
    else if (ar >= 0.35) s += 2  // weighted ACWR ≥ 1.35 (dominant sport high)
    else if (ar >= 0.18) s += 1  // weighted ACWR ≥ 1.18 (elevated)
    // Ramp rate: >30% — all established → +1, mixed/mostly new → +2
    //            >15% — all established → +0, mixed/mostly new → +1
    if (rampHigh)                         s += rampAllEstablished ? 1 : 2
    else if (rampElevated && !rampAllEstablished) s += 1
    if (consecutiveDays >= 5) s += 2
    else if (consecutiveDays >= 3) s += 1
    return s
  }

  const todayActivities = activities.filter(a => a.start_date.slice(0, 10) === todayStr)
  const todayHevy       = hevy.filter(h => h.start_time.slice(0, 10) === todayStr)
  const todayDoneGym    = todayHevy.length > 0
  const todayDoneRun    = todayActivities.some(a => (a.sport_type ?? '').toLowerCase().includes('run'))
  const todayDoneRide   = todayActivities.some(a => { const t = (a.sport_type ?? '').toLowerCase(); return t.includes('ride') || t.includes('cycl') })
  const todayDoneSwim   = todayActivities.some(a => (a.sport_type ?? '').toLowerCase().includes('swim'))

  function isEventDone(e: any): boolean {
    const t = (e.title ?? '').toLowerCase()
    const isGymEvt = ['push','pull','legs','squat','gym','kracht','strength','bench','deadlift','hyrox'].some(k => t.includes(k))
    const isRunEvt = ['run','loop','hardloop','interval','tempo'].some(k => t.includes(k))
    const isRideEvt = ['ride','fiet','cycl','bike'].some(k => t.includes(k))
    const isSwimEvt = ['swim','zwem'].some(k => t.includes(k))
    if (isGymEvt) return todayDoneGym
    if (isRunEvt) return todayDoneRun
    if (isRideEvt) return todayDoneRide
    if (isSwimEvt) return todayDoneSwim
    return false
  }

  const todayEvtsAll  = events.filter(e => evtDate(e) === todayStr    && isSportEvt(e))
    .sort((a, b) => (a.start_datetime || a.start_date).localeCompare(b.start_datetime || b.start_date))
  const todayEvtsDone = todayEvtsAll.filter(e => isEventDone(e))
  const todayEvts     = todayEvtsAll.filter(e => !isEventDone(e))
  const tomorrowEvts = events.filter(e => evtDate(e) === tomorrowStr && isSportEvt(e))
    .sort((a, b) => (a.start_datetime || a.start_date).localeCompare(b.start_datetime || b.start_date))
  const day2Evts     = events.filter(e => evtDate(e) === day2Str && isSportEvt(e))
  const day3Evts     = events.filter(e => evtDate(e) === day3Str && isSportEvt(e))
  const upcomingHard = [...tomorrowEvts, ...day2Evts, ...day3Evts].find(e => {
    const i = classify(e.title); return i === 'hard' || i === 'very_hard'
  }) ?? null

  function decide(intensity: Intensity): keyof typeof ACT {
    const rs = riskScore()
    const canMoveTmr = tomorrowEvts.length === 0 && day2Evts.length === 0

    if (intensity === 'zone2') return recoveryPct < 25 ? 'skip' : 'proceed'
    if (intensity === 'easy')  return recoveryPct < 35 ? 'skip' : rs >= 5 ? 'recover' : 'proceed'

    if (intensity === 'moderate') {
      if (rs >= 7) return canMoveTmr ? 'moveTmr' : 'skip'
      if (rs >= 5) return 'recover'
      if (rs >= 3) return 'shorten'
      if (rs >= 1) return 'easier'
      return 'proceed'
    }
    if (intensity === 'hard') {
      if (rs >= 8) return 'skip'
      if (rs >= 6) return canMoveTmr ? 'moveTmr' : 'skip'
      if (rs >= 4) return 'recover'
      if (rs >= 2) return 'shorten'
      if (rs >= 1) return 'easier'
      return 'proceed'
    }
    // very_hard
    if (rs >= 7) return 'skip'
    if (rs >= 5) return canMoveTmr ? 'moveTmr' : 'skip'
    if (rs >= 3) return 'recover'
    if (rs >= 1) return 'shorten'
    return recoveryPct >= 80 && weightedACWRRisk() < 0.18 ? 'proceed' : 'easier'
  }

  function buildReasons(intensity: Intensity): string[] {
    const r: string[] = []
    if (highLoad)     r.push(`Training load +${Math.abs(loadPct)}% higher than last week`)
    else if (medLoad) r.push(`Training load +${Math.abs(loadPct)}% higher than last week`)
    if (recoveryPct < 70) {
      if (lastWorkoutHoursAgo !== null && lastWorkoutHoursAgo <= 48) {
        r.push(`Last workout ${lastWorkoutHoursAgo}h ago`)
      } else {
        r.push('Recovery lower than usual')
      }
    }
    if (consecutiveDays >= 3) r.push(`${consecutiveDays} training days in a row`)
    if (upcomingHard) {
      const d = evtDate(upcomingHard)
      const dayLbl = d === tomorrowStr ? 'tomorrow' : d === day2Str ? 'day after tomorrow' : 'soon'
      r.push(`${upcomingHard.title} planned ${dayLbl}`)
    } else if (intensity === 'zone2' && r.length < 2) {
      r.push('Low impact on recovery')
    }
    return r.slice(0, 3)
  }

  // ── Today's planned session already completed ───────────────────────────────
  if (todayEvtsDone.length > 0 && todayEvts.length === 0) {
    const done = todayEvtsDone[0]
    const tomorrowNext = tomorrowEvts[0] ?? null
    const doneWasCardio = todayDoneRun || todayDoneRide || todayDoneSwim
    const rs = riskScore()

    // After the planned (usually strength) session: is there still room for an
    // easy aerobic session today, or is it better to just rest?
    const canAddCardio = !doneWasCardio
      && recoveryPct >= 60
      && rs <= 3
      && weightedACWRRisk() < 0.35
      && !upcomingHard

    if (canAddCardio) {
      return {
        emoji: '🚴',
        label: `${done.title} done — room for easy cardio`,
        action: 'Optional Zone 2',
        actionColor: '#2dd4bf',
        reasons: [
          'You recovered well — an easy run, ride or swim is fine if you want more',
          'Keep it Zone 2 (conversational pace) — low fatigue cost',
          tomorrowNext ? `${tomorrowNext.title} planned tomorrow — keep it light` : 'Or simply rest — both are good choices',
        ],
      }
    }

    return {
      emoji: '✅',
      label: `${done.title} done`,
      ...ACT.skip,
      action: 'Rest & recover',
      actionColor: '#4ade80',
      reasons: [
        doneWasCardio ? 'Cardio done — let your body absorb it' : 'Enough training for today — no extra cardio needed',
        recoveryPct < 60 ? `Recovery ${recoveryPct}% — prioritise sleep and nutrition` : `Recovery ${recoveryPct}% — looking good`,
        tomorrowNext ? `${tomorrowNext.title} planned tomorrow — recover well` : 'Hydrate and get quality sleep tonight',
      ],
    }
  }

  // ── Today has planned sessions ──────────────────────────────────────────────
  if (todayEvts.length > 0) {
    const ev        = todayEvts[0]
    const intensity = classify(ev.title)
    const actKey    = decide(intensity)
    const act = ACT[actKey]

    return {
      emoji: sportEmoji(ev.title),
      label: `${ev.title}${evtTime(ev)}`,
      ...act,
      reasons: buildReasons(intensity),
    }
  }

  // ── No today events — look ahead up to 3 days ──────────────────────────────
  const nextPlanned = tomorrowEvts[0] ?? day2Evts[0] ?? day3Evts[0] ?? null
  if (nextPlanned) {
    const npIntensity = classify(nextPlanned.title)
    const npDate      = evtDate(nextPlanned)
    const npDayLbl    = npDate === tomorrowStr ? 'tomorrow' : npDate === day2Str ? 'day after tomorrow' : 'soon'
    if (npIntensity === 'hard' || npIntensity === 'very_hard') {
      if (recoveryPct < 50 || highLoad) {
        const restReasons = [
          recoveryPct < 50 ? (lastWorkoutHoursAgo !== null ? `Last workout ${lastWorkoutHoursAgo}h ago` : 'Recovery lower than usual') : '',
          ...(highLoad ? [`Training load +${Math.abs(loadPct)}% higher than last week`] : []),
          `${nextPlanned.title} planned ${npDayLbl}`,
        ].filter(Boolean).slice(0, 3) as string[]
        return {
          emoji: '😴', label: 'Rest today',
          ...ACT.skip, reasons: restReasons,
        }
      }
      return {
        emoji: '🚶', label: 'Train light',
        ...ACT.easier,
        reasons: [
          `${nextPlanned.title} planned ${npDayLbl}`,
          ...(medLoad ? [`Training load +${Math.abs(loadPct)}% higher than last week`] : []),
        ].slice(0, 3) as string[],
      }
    }
  }

  // ── No events — muscle-group aware recommendation ──────────────────────────
  const weekStart    = startOfWeek()
  const weekStrength = hevy.filter(h => h.start_time >= weekStart && !isAccessorySession(h)).length
  const weekRuns     = activities.filter(a => isRun(a) && a.start_date >= weekStart).length
  const weekRides    = activities.filter(a => isRide(a) && a.start_date >= weekStart).length
  const rs           = riskScore()

  // Hard rest: very low readiness
  if (recoveryPct < 40) return {
    emoji: '😴', label: 'Rest day recommended', ...ACT.skip,
    reasons: [
      lastWorkoutHoursAgo !== null ? `Last workout ${lastWorkoutHoursAgo}h ago` : 'Recovery too low to train',
      ...(highLoad ? [`Training load +${Math.abs(loadPct)}% higher than last week`] : []),
    ],
  }

  // Active recovery: low readiness or high risk
  if (recoveryPct < 55 || rs >= 5) return {
    emoji: '🚶', label: 'Active recovery', ...ACT.recover,
    reasons: [
      lastWorkoutHoursAgo !== null && lastWorkoutHoursAgo <= 36
        ? `Last workout ${lastWorkoutHoursAgo}h ago`
        : 'Recovery lower than usual',
      ...(highLoad ? [`Training load +${Math.abs(loadPct)}% higher than last week`] : []),
    ],
  }

  // Muscle group advice
  const muscleAdvice  = computeMuscleGroupAdvice(hevy)
  const legsReady     = muscleAdvice.find(g => g.label === 'Legs')?.recommendation === 'train'
  const chestReady    = muscleAdvice.find(g => g.label === 'Chest')?.recommendation === 'train'
  const shoulderReady = muscleAdvice.find(g => g.label === 'Shoulders')?.recommendation === 'train'
  const backReady     = muscleAdvice.find(g => g.label === 'Back')?.recommendation === 'train'
  const armsReady     = muscleAdvice.find(g => g.label === 'Arms')?.recommendation === 'train'
  const pushReady     = chestReady && shoulderReady
  const pullReady     = backReady

  const cardioReady = recoveryPct >= 65 && weekRuns + weekRides < 5
  const strengthBalance = weekStrength < 3

  // Leg day — most demanding, suggest when recovered and not overdone this week
  if (legsReady && strengthBalance) return {
    emoji: '🏋️', label: 'Leg day recommended', ...ACT.proceed,
    reasons: [
      'Legs recovered and ready to train',
      weekStrength < 2 ? 'Low strength volume this week' : 'Good balance for the week',
    ],
  }

  // Zone 2 cardio — aerobic base building
  if (cardioReady && weekRuns + weekRides < 3 && !legsReady) return {
    emoji: '🏃', label: 'Easy endurance run recommended', ...ACT.proceed,
    reasons: [
      `Capacity ${recoveryPct}% — good time for endurance training`,
      'Low cardio volume this week',
    ],
  }

  // Push day
  if (pushReady && strengthBalance) return {
    emoji: '💪', label: 'Push day recommended', ...ACT.proceed,
    reasons: [
      'Chest and shoulders recovered',
      pullReady ? 'Push/pull alternation for optimal recovery' : 'Good time for pressing',
    ],
  }

  // Pull day
  if (pullReady && strengthBalance) return {
    emoji: '💪', label: 'Pull day recommended', ...ACT.proceed,
    reasons: [
      'Back recovered — rows and pull-ups recommended',
      armsReady ? 'Arms also recovered — combine with bicep work' : 'Focus on compound back movements',
    ],
  }

  // Zone 2 cardio fallback
  if (cardioReady) return {
    emoji: '🚴', label: 'Easy endurance ride recommended', ...ACT.proceed,
    reasons: [`Capacity ${recoveryPct}% — endurance or recovery ride recommended`],
  }

  // Default: light training or rest
  if (recoveryPct >= 70) return {
    emoji: '🏃', label: 'Light training', ...ACT.easier,
    reasons: ['No muscle groups fully recovered', 'Light intensity recommended'],
  }

  return {
    emoji: '😴', label: 'Rest day recommended', ...ACT.skip,
    reasons: [`Capacity ${recoveryPct}% — full recovery recommended`],
  }
}

// Strength effort derived from volume and sets — replaces the fixed 0.85 guess.
// Light day (1000kg/15 sets) → ~0.55, medium (3000kg/20 sets) → ~0.70, heavy (6000kg/30 sets) → ~0.90
function computeStrengthEffort(h: HevyWorkout): number {
  const sets = h.sets ?? 0
  const vol  = h.volume_kg ?? 0
  const setsFactor = Math.min(1, sets / 25)
  const volFactor  = vol > 0 ? Math.min(1, vol / 6000) : setsFactor
  return 0.5 + ((setsFactor + volFactor) / 2) * 0.45
}

function computeActivityEffort(a: Activity): number {
  const durationH = (a.moving_time ?? 0) / 3600
  let intensity = 0.4 // default lean easy when no data

  if (a.average_heartrate && a.average_heartrate > 0) {
    // Zone 1 ~<130bpm=0, Zone 2 ~135bpm=0.2, Zone 3 ~155bpm=0.5, Zone 4 ~170bpm=0.7, Zone 5 ~185bpm=1.0
    intensity = Math.min(1, Math.max(0, (a.average_heartrate - 120) / 70))
  } else {
    const sport = (a.sport_type ?? '').toLowerCase()
    if (sport.includes('run')) {
      const distKm = (a.distance ?? 0) / 1000
      const secPerKm = distKm > 0 && a.moving_time ? a.moving_time / distKm : 390
      // 7:30/km=450s easy=0 → 5:00/km=300s moderate=0.5 → 3:30/km=210s hard=1.0
      intensity = Math.min(1, Math.max(0, (450 - secPerKm) / 240))
    } else if (sport.includes('ride') || sport.includes('cycl')) {
      const speedKmh = (a.average_speed ?? 0) * 3.6
      // 20km/h easy=0 → 30km/h moderate=0.5 → 40km/h hard=1.0
      intensity = Math.min(1, Math.max(0, (speedKmh - 20) / 20))
    }
  }

  // Volume adds fatigue even at low intensity: up to +0.2 for 2h
  return Math.min(1, intensity + Math.min(0.2, durationH * 0.1))
}

function computeRecoveryDetail(
  activities: Activity[],
  hevy: HevyWorkout[]
): { pct: number; label: string; factors: string[] } {
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 86400000

  // Combine all workouts from the last 7 days with their effort scores.
  // Strength uses volume+sets to estimate effort; cardio uses HR or pace.
  const workouts = [
    ...activities
      .filter(a => new Date(a.start_date).getTime() >= sevenDaysAgo)
      .map(a => ({ time: new Date(a.start_date).getTime(), effort: computeActivityEffort(a), type: 'cardio' as const })),
    ...hevy
      .filter(h => new Date(h.start_time).getTime() >= sevenDaysAgo)
      .map(h => ({ time: new Date(h.start_time).getTime(), effort: computeStrengthEffort(h), type: 'strength' as const })),
  ].sort((a, b) => b.time - a.time)

  if (workouts.length === 0) {
    return { pct: 95, label: 'Fully recovered', factors: ['No recent workouts found'] }
  }

  // Cumulative fatigue with 36h half-life exponential decay.
  // Each workout contributes effort × e^(-h × ln2 / 36).
  // Zone 2 (effort≈0.2) adds minimal fatigue; a heavy session (effort≈0.9) adds much more.
  let fatigue = 0
  for (const w of workouts) {
    const hoursAgo = (now - w.time) / 3600000
    const decay = Math.exp(-hoursAgo * Math.LN2 / 36)
    fatigue += w.effort * decay
  }

  // fatigue 0 → 95%, 0.5 → 81%, 1.0 → 67%, 1.5 → 53%, 2.0+ → ~25%
  const pct = Math.min(95, Math.max(20, Math.round(95 - fatigue * 28)))

  const factors: string[] = []
  const last = workouts[0]
  const hoursAgo = (now - last.time) / 3600000
  const timeLabel = hoursAgo < 24 ? `${Math.round(hoursAgo)}h ago` : `${Math.round(hoursAgo / 24)}d ago`
  const effortLabel = last.effort < 0.35 ? 'zone 2' : last.effort < 0.60 ? 'moderate' : 'hard'
  factors.push(`Last workout: ${timeLabel} · ${effortLabel}`)
  if (last.type === 'cardio' && last.effort < 0.35) factors.push('Zone 2 — low fatigue impact')

  const weekStrength = workouts.filter(w => w.type === 'strength').length
  const weekCardio   = workouts.filter(w => w.type === 'cardio').length
  const parts: string[] = []
  if (weekStrength > 0) parts.push(`${weekStrength} strength`)
  if (weekCardio > 0)   parts.push(`${weekCardio} cardio`)
  if (parts.length > 0) factors.push(`This week: ${parts.join(', ')}`)

  const label = pct >= 70 ? 'Ready to train' : pct >= 45 ? 'Light recovery recommended' : 'High fatigue'
  return { pct, label, factors }
}

function TodaysFocusCard({ focus }: { focus: { emoji: string; label: string; sub: string } }) {
  return (
    <Card>
      <div className="flex items-center gap-4">
        <span className="text-[36px] leading-none">{focus.emoji}</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Today's Focus</span>
          <span className="text-[17px] font-semibold text-white leading-snug">{focus.label}</span>
          <span className="text-[13px] text-white/50">{focus.sub}</span>
        </div>
      </div>
    </Card>
  )
}

const GYM_KW = ['pull', 'push', 'legs', 'chest', 'back', 'squat', 'gym', 'strength', 'deadlift', 'bench', 'bicep', 'tricep', 'shoulder', 'upper', 'lower', 'weights', 'strength']
const CARDIO_KW = ['run', 'long run', 'ride', 'bike', 'swim', 'swim', 'cycling', 'run', 'cycle', 'long run', 'interval', 'tempo']

function TodaysPlanCard({ focus, calendarEvents, readinessPct, biasApplied = false }: {
  focus: TodaysFocus
  calendarEvents: any[]
  readinessPct: number
  biasApplied?: boolean
}) {
  const now = new Date().toISOString()
  const next = (calendarEvents ?? [])
    .filter((e: any) => (e.start_datetime || e.start_date) >= now)
    .sort((a: any, b: any) => (a.start_datetime || a.start_date).localeCompare(b.start_datetime || b.start_date))[0]

  const [ctaLabel, ctaHref] = (() => {
    // When today's session is done and there's room for optional cardio, point at it
    if (focus.label.toLowerCase().includes('cardio') || focus.action.includes('Zone 2'))
      return ["Plan easy cardio →", '/training/running']
    if (!next) return ["View training →", '/training']
    const t = (next.title ?? '').toLowerCase()
    const isGym = GYM_KW.some(k => t.includes(k))
    const isCardio = CARDIO_KW.some(k => t.includes(k))
    if (isGym && !isCardio) return ["View strength →", '/training/strength']
    const dateStr = next.start_datetime || next.start_date
    return ["View session →", `/training/session?title=${encodeURIComponent(next.title ?? '')}&time=${encodeURIComponent(dateStr)}`]
  })()

  return (
    <div className="p-5 rounded-[24px] border border-white/[0.12]" style={{ background: 'rgba(45,212,191,0.07)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em]">Today's Recommendation</p>
        {biasApplied && (
          <span className="text-[10px] font-semibold text-teal-400/70 uppercase tracking-[0.08em]">✦ Personalised</span>
        )}
      </div>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-[42px] leading-none">{focus.emoji}</span>
        <div className="flex flex-col gap-1.5">
          <span className="text-[22px] font-bold text-white leading-tight">{focus.label}</span>
          <span
            className="self-start px-2.5 py-0.5 rounded-full text-[11px] font-bold text-black"
            style={{ background: focus.actionColor }}
          >
            {focus.action}
          </span>
        </div>
      </div>

      {focus.reasons.length > 0 && (
        <div className="pt-3 border-t border-white/[0.08] mb-3">
          <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.08em] mb-2">Why?</p>
          <div className="flex flex-col gap-1.5">
            {focus.reasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-teal-400/60 text-[12px] mt-[2px] shrink-0">•</span>
                <span className="text-[13px] text-white/65 leading-snug">{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <a href={ctaHref}
        className="flex items-center justify-center py-2 rounded-[14px] text-[13px] font-semibold text-black"
        style={{ background: 'rgb(45,212,191)' }}>
        {ctaLabel}
      </a>
    </div>
  )
}

function buildWeekPrediction(
  acwrDetail: ACWRDetail,
  rampRate: number | null,
  recoveryPct: number,
): string | null {
  const acwr = acwrDetail.total
  if (acwr !== null && acwr > 1.3) {
    if (rampRate !== null && rampRate > 20)
      return 'Load remains high over the coming days — plan a recovery day.'
    const projected = Math.max(1.0, acwr - (acwr - 1.0) * 0.56)
    return `ACWR will drop to ~${projected.toFixed(2)} within 4 days at current load.`
  }
  if (recoveryPct < 60) {
    const daysNeeded = Math.max(1, Math.ceil((70 - recoveryPct) / 8))
    const target = new Date(Date.now() + daysNeeded * 86400000)
    const dayName = target.toLocaleDateString('en-US', { weekday: 'long' })
    return `Readiness expected >70% by ${dayName}.`
  }
  return null
}

function WeekSummaryCard({ weekCompleted, weekUpcomingPlanned, sportRows }: {
  weekCompleted: number
  weekUpcomingPlanned: number
  sportRows: { icon: string; label: string; done: number; target: number }[]
}) {
  const totalTarget = sportRows.reduce((s, r) => s + r.target, 0)
  const coachLabel = (() => {
    if (weekCompleted === 0) return { text: 'Nothing done yet', color: 'text-white/40' }
    if (totalTarget === 0) return weekCompleted >= 3
      ? { text: 'Good progress', color: 'text-teal-400' }
      : { text: 'Building up', color: 'text-white/50' }
    if (weekCompleted >= totalTarget) return { text: 'On track', color: 'text-teal-400' }
    if (weekCompleted >= totalTarget - 1) return { text: 'Almost on track', color: 'text-yellow-400' }
    return { text: `${totalTarget - weekCompleted} session${totalTarget - weekCompleted !== 1 ? 's' : ''} behind`, color: 'text-orange-400' }
  })()

  const visibleRows = sportRows.filter(r => r.done > 0 || r.target > 0)

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">This week</span>
          <span className={`text-[13px] font-semibold ${coachLabel.color}`}>{coachLabel.text}</span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-[36px] font-bold text-white leading-none">{weekCompleted}</span>
          <span className="text-[16px] text-white/50">
            {totalTarget > 0 ? `/ ${totalTarget} sessions` : 'sessions completed'}
          </span>
        </div>

        {weekUpcomingPlanned > 0 && (
          <span className="text-[13px] text-white/40">{weekUpcomingPlanned} {weekUpcomingPlanned === 1 ? 'session' : 'sessions'} still planned</span>
        )}

        {visibleRows.length > 0 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
            {visibleRows.map(r => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-[13px] text-white/50">{r.icon} {r.label}</span>
                <div className="flex items-center gap-2">
                  {r.target > 0 && (
                    <div className="flex gap-1">
                      {Array.from({ length: r.target }).map((_, i) => (
                        <div
                          key={i}
                          className="w-[8px] h-[8px] rounded-full"
                          style={{ background: i < r.done ? 'rgb(45,212,191)' : 'rgba(255,255,255,0.12)' }}
                        />
                      ))}
                    </div>
                  )}
                  <span className="text-[14px] font-semibold text-white">
                    {r.target > 0 ? `${r.done}/${r.target}` : `${r.done}×`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function PerformanceHeroCard({ perf }: { perf: ReturnType<typeof computePerformanceScore> }) {
  const trendLabel = perf.loadRatio > 1.1 ? '↑ Load increasing' : perf.loadRatio < 0.9 ? '↓ Load declining' : '→ Load stable'
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

function RecoveryDetailCard({
  recovery,
  physiology,
}: {
  recovery: { pct: number; label: string; factors: string[] }
  physiology: { score: number | null; label: string; color: string; explanation: string }
}) {
  const unified = physiology.score !== null
    ? Math.round(physiology.score * 0.70 + recovery.pct * 0.30)
    : recovery.pct
  const label = physiology.score !== null ? physiology.label : recovery.label
  const c = unified >= 70 ? '#4ade80' : unified >= 45 ? '#fb923c' : '#f87171'

  // Show fatigue explanation when training load is the dominant drag
  const fatigueIsDominant = recovery.pct < 55 && (physiology.score === null || recovery.pct < physiology.score - 20)
  const explanation = fatigueIsDominant
    ? 'Readiness is primarily limited by high training fatigue from recent days.'
    : physiology.explanation

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Training Load</span>
        <div className="flex items-end justify-between">
          <span className="text-[40px] font-bold text-white leading-none">{unified}%</span>
          <span className="text-[15px] font-semibold pb-1" style={{ color: c }}>{label}</span>
        </div>
        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full" style={{ width: `${unified}%`, background: c }} />
        </div>
        <div className="flex items-center gap-2 py-1">
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
          <span className="text-[14px] font-semibold" style={{ color: c }}>
            {unified >= 70 ? 'Normal training' : unified >= 45 ? 'Avoid max effort' : 'Priority: recovery today'}
          </span>
        </div>
        {explanation ? (
          <p className="text-[12px] text-white/40 leading-relaxed pt-0.5">{explanation}</p>
        ) : physiology.score !== null && (
          <span className="text-[12px] text-white/35 pt-0.5">
            Physiology {physiology.score}% · Training load {recovery.pct}%
          </span>
        )}
        <div className="flex flex-col gap-1.5 pt-1">
          {recovery.factors.map((f, i) => (
            <span key={i} className="text-[13px] text-white/50">· {f}</span>
          ))}
        </div>
      </div>
    </Card>
  )
}

function TrainingLoadCard({ weekCompleted, weekPlanned, weekKm, weekDurationSecs, weekVolume, rampRate }: {
  weekCompleted: number; weekPlanned: number; weekKm: number; weekDurationSecs: number
  weekVolume: number; rampRate: number | null
}) {
  const stats = [
    weekCompleted > 0 && `${weekCompleted} session${weekCompleted !== 1 ? 's' : ''}${weekPlanned > 0 ? ` (${weekPlanned} planned)` : ''}`,
    weekDurationSecs > 0 && `${formatDuration(weekDurationSecs)} total`,
    weekKm > 0 && `${weekKm.toFixed(1)} km running`,
    weekVolume > 0 && `${Math.round(weekVolume).toLocaleString('en-US')} kg lifted`,
  ].filter(Boolean) as string[]

  const rampColor = rampRate == null ? 'rgba(255,255,255,0.5)'
    : rampRate > 40 ? '#f87171' : rampRate > 20 ? '#fb923c' : rampRate > 10 ? '#facc15'
    : rampRate < -10 ? '#60a5fa' : '#4ade80'
  const rampLabel = rampRate == null ? ''
    : rampRate > 40 ? 'very high — monitor recovery'
    : rampRate > 20 ? 'high — build gradually'
    : rampRate > 10 ? 'moderate increase'
    : rampRate < -10 ? 'decreasing'
    : 'stable'

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Training Load</span>
        {stats.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {stats.map((s, i) => (
              <span key={i} className="text-[14px] text-white/80">{s}</span>
            ))}
          </div>
        ) : (
          <span className="text-[14px] text-white/30">No trainings this week yet</span>
        )}

        {rampRate !== null && (
          <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
            <span className="text-[12px] font-semibold text-white/40 uppercase tracking-[0.08em]">Ramp</span>
            <span className="text-[15px] font-bold" style={{ color: rampColor }}>
              {rampRate > 0 ? '+' : ''}{rampRate}%
            </span>
            <span className="text-[13px] text-white/40">vs last week — {rampLabel}</span>
          </div>
        )}
      </div>
    </Card>
  )
}

function ACWRCard({ detail }: { detail: ACWRDetail }) {
  const [expanded, setExpanded] = useState(false)
  const { total, confidence, sports, explanation } = detail

  const col = (v: number | null) =>
    v == null ? 'rgba(255,255,255,0.4)'
    : v > 1.5 ? '#f87171' : v > 1.3 ? '#fb923c' : v < 0.8 ? '#60a5fa' : '#4ade80'

  // Confidence-sensitive status: shrink ACWR toward 1.0 for effective classification
  const effTotal = total === null ? null
    : confidence === 'high'   ? total
    : confidence === 'medium' ? 1.0 + (total - 1.0) * 0.75
    : /* low */                 1.0 + (total - 1.0) * 0.50

  const status = effTotal == null ? null
    : effTotal > 1.5 ? (confidence === 'high' ? 'High risk' : confidence === 'medium' ? 'Elevated load' : 'Monitor')
    : effTotal > 1.3 ? (confidence === 'high' ? 'Elevated load' : 'Monitor')
    : effTotal < 0.8 ? 'Underloaded'
    : 'Optimal'

  const statusColor = effTotal !== null && effTotal > 1.5 && confidence !== 'high'
    ? 'rgba(255,255,255,0.5)'
    : col(effTotal)

  const confLabel = confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low'
  const confColor = confidence === 'high' ? '#4ade80' : confidence === 'medium' ? '#facc15' : '#fb923c'

  return (
    <Card>
      <button className="w-full text-left active:opacity-70 transition-opacity" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">ACWR</span>
          <ChevronRight size={14} className="text-white/25 transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />
        </div>
        <div className="flex items-center gap-3 mb-1.5">
          {total !== null && effTotal !== null ? (
            <>
              <span className="text-[28px] font-bold leading-none" style={{ color: col(effTotal) }}>{total.toFixed(2)}</span>
              {status && <span className="text-[15px] font-semibold" style={{ color: statusColor }}>{status}</span>}
            </>
          ) : (
            <span className="text-[15px] text-white/40">No data</span>
          )}
          <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{ color: confColor, backgroundColor: `${confColor}22` }}>
            {confLabel} confidence
          </span>
        </div>
        {explanation && (
          <p className="text-[12px] text-white/40 leading-relaxed">{explanation}</p>
        )}
      </button>

      {expanded && sports.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-col gap-2.5">
          {sports.map(s => {
            const sConfLabel = s.confidence === 'high' ? 'High' : s.confidence === 'medium' ? 'Medium' : 'Low'
            const sConfColor = s.confidence === 'high' ? '#4ade80' : s.confidence === 'medium' ? '#facc15' : '#fb923c'
            return (
              <div key={s.key} className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[14px] text-white/70">{s.label}</span>
                    <span className="text-[11px]" style={{ color: sConfColor }}>
                      {sConfLabel} · {s.daysWithData} training days
                    </span>
                  </div>
                  <div className="shrink-0">
                    {s.acwr !== null ? (
                      <span className="text-[15px] font-bold" style={{ color: col(s.acwr) }}>{s.acwr.toFixed(2)}</span>
                    ) : (
                      <span className="text-[12px] text-white/30">–</span>
                    )}
                  </div>
                </div>
                {s.loadComposition && (
                  <span className="text-[11px] text-white/30">
                    Primary {s.loadComposition.primary}%
                    {s.loadComposition.isolation > 0 && ` · Isolation ${s.loadComposition.isolation}%`}
                    {s.loadComposition.accessory > 0 && ` · Accessory ${s.loadComposition.accessory}%`}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
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
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">Top Insights</span>
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

function NextWorkoutCard({ calendarEvents }: {
  calendarEvents: any[]
}) {
  const now = new Date().toISOString()
  const next = (calendarEvents ?? [])
    .filter((e: any) => (e.start_datetime || e.start_date) >= now)
    .sort((a: any, b: any) => (a.start_datetime || a.start_date).localeCompare(b.start_datetime || b.start_date))[0]

  const dateStr = next ? (next.start_datetime || next.start_date) : null
  const when = dateStr ? new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' }) : null
  const time = next?.start_datetime
    ? formatClockTime(next.start_datetime)
    : null
  let countdown: string | null = null
  if (dateStr) {
    const eventDate = (next.start_datetime || next.start_date).slice(0, 10)
    const todayDate = new Date().toISOString().slice(0, 10)
    const tomorrowDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    countdown = eventDate === todayDate ? 'Today' : eventDate === tomorrowDate ? 'Tomorrow' : when
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Next Workout</span>
          {next ? (
            <>
              {countdown && <span className="text-[12px] font-semibold text-teal-400 mt-1">{countdown}</span>}
              <span className="text-[17px] font-semibold text-white">{next.title}</span>
              <span className="text-[13px] text-white/50">{when}{time ? ` · ${time}` : ''}</span>
            </>
          ) : (
            <span className="text-[15px] text-white/30 mt-1">No planned workouts</span>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function LearnedAboutYouCard({ profile }: { profile: PersonalProfile }) {
  if (profile.insights.length === 0) return null
  const confLabel = profile.dataConfidence === 'high' ? 'High confidence'
    : profile.dataConfidence === 'medium' ? 'Learning' : 'Early days'
  const confColor = profile.dataConfidence === 'high' ? 'text-teal-400'
    : profile.dataConfidence === 'medium' ? 'text-yellow-400' : 'text-white/40'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">What Kern learned about you</span>
          <span className={`text-[11px] font-semibold ${confColor}`}>{confLabel}</span>
        </div>
        <div className="flex flex-col gap-3">
          {profile.insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-[20px] leading-none mt-0.5 shrink-0">{ins.icon}</span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-white leading-snug">{ins.title}</span>
                <span className="text-[13px] text-white/55 leading-snug">{ins.detail}</span>
              </div>
            </div>
          ))}
        </div>
        {profile.dataConfidence !== 'high' && (
          <span className="text-[12px] text-white/35 pt-1 border-t border-white/[0.06]">
            Keep wearing your tracker and logging workouts — these get sharper over time.
          </span>
        )}
      </div>
    </Card>
  )
}

export function OverviewSection({ activities, hevy, calendarEvents, pastCalendarEvents = [], trainingFrequencies = {}, biasBySport = {} }: {
  activities: Activity[]; hevy: HevyWorkout[]; calendarEvents: any[]
  pastCalendarEvents?: any[]
  trainingFrequencies?: Record<string, number>
  biasBySport?: Record<string, number>
}) {
  const { data: gezondheid } = useSWR<HealthRow[]>('health-gezondheid', null)
  const supabase = useMemo(() => createClient(), [])
  const overrideLoggedRef = useRef(false)

  const perf = computePerformanceScore(activities, hevy)
  const recoveryDetail = computeRecoveryDetail(activities, hevy)
  const physiologyReadiness = computePhysiologyReadiness(gezondheid ?? [])

  const now = Date.now()
  const weekStart = startOfWeek()

  const weekActivities = activities.filter(a => a.start_date >= weekStart && !isWeightTraining(a))
  const weekHevy = hevy.filter(h => h.start_time >= weekStart)
  const weekCompleted = weekActivities.length + weekHevy.length
  const weekEnd = new Date(new Date(weekStart).getTime() + 7 * 86400000).toISOString()
  const nowStr = new Date().toISOString()
  const weekUpcomingPlanned = (calendarEvents ?? []).filter((e: any) => {
    const dt = e.start_datetime || e.start_date
    return dt >= nowStr && dt < weekEnd
  }).length

  // Per-sport counts this week
  const weekGym      = weekHevy.length
  const weekRunning  = weekActivities.filter(a => (a.sport_type ?? '').toLowerCase().includes('run')).length
  const weekCycling  = weekActivities.filter(a => { const t = (a.sport_type ?? '').toLowerCase(); return t.includes('ride') || t.includes('cycl') }).length
  const weekSwimming = weekActivities.filter(a => (a.sport_type ?? '').toLowerCase().includes('swim')).length

  const sportRows = [
    { icon: '🏋️', label: 'Gym',      done: weekGym,      target: trainingFrequencies.gym      ?? 0 },
    { icon: '🏃', label: 'Running',  done: weekRunning,  target: trainingFrequencies.running  ?? 0 },
    { icon: '🚴', label: 'Cycling',  done: weekCycling,  target: trainingFrequencies.cycling  ?? 0 },
    { icon: '🏊', label: 'Swimming', done: weekSwimming, target: trainingFrequencies.swimming ?? 0 },
  ]

  const rawReadinessPct = physiologyReadiness.score !== null
    ? Math.round(physiologyReadiness.score * 0.70 + recoveryDetail.pct * 0.30)
    : recoveryDetail.pct

  // Apply personal bias: if user consistently handles more load than model predicts,
  // adjust displayed readiness upward (capped at ±10 points)
  const biasValues = Object.values(biasBySport)
  const avgBias = biasValues.length > 0 ? biasValues.reduce((s, v) => s + v, 0) / biasValues.length : 0
  const biasPoints = Math.round(avgBias * 100) // e.g. 0.05 bias → +5 points
  const unifiedReadinessPct = Math.min(100, Math.max(0, rawReadinessPct + biasPoints))
  const biasApplied = biasPoints !== 0

  const todayStr    = new Date().toISOString().slice(0, 10)
  const todayActivities = activities.filter(a => a.start_date.slice(0, 10) === todayStr)
  const todayHevy       = hevy.filter(h => h.start_time.slice(0, 10) === todayStr)

  const sevenDaysAgo     = new Date(now - 7  * 86400000).toISOString()
  const fourteenDaysAgo  = new Date(now - 14 * 86400000).toISOString()
  const acute7kj = activities.filter(a => a.start_date >= sevenDaysAgo).reduce((s, a) => s + effectiveLoad(a), 0)
    + hevy.filter(h => h.start_time >= sevenDaysAgo && !isAccessorySession(h)).reduce((s, h) => s + hevyLoad(h), 0)
  const prev7kj  = activities.filter(a => a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo).reduce((s, a) => s + effectiveLoad(a), 0)
    + hevy.filter(h => h.start_time >= fourteenDaysAgo && h.start_time < sevenDaysAgo && !isAccessorySession(h)).reduce((s, h) => s + hevyLoad(h), 0)
  const rampRate = prev7kj > 5
    ? Math.max(-100, Math.min(200, Math.round((acute7kj - prev7kj) / prev7kj * 100)))
    : null
  const acwrDetail  = computeACWRDetail(activities, hevy, now, rampRate)
  const todaysFocus = computeTodaysFocus(activities, hevy, calendarEvents, unifiedReadinessPct, perf, acwrDetail, rampRate)

  // Detect overrides: did user train today when advice would have been rest?
  useEffect(() => {
    if (overrideLoggedRef.current) return
    if (todayHevy.length === 0 && todayActivities.length === 0) return

    // Recompute what advice WOULD have been without today's workouts
    const activitiesWithoutToday = activities.filter(a => a.start_date.slice(0, 10) !== todayStr)
    const hevyWithoutToday       = hevy.filter(h => h.start_time.slice(0, 10) !== todayStr)
    const priorFocus = computeTodaysFocus(activitiesWithoutToday, hevyWithoutToday, calendarEvents, rawReadinessPct, perf, acwrDetail, rampRate)

    const wasRestAdvice = priorFocus.action === 'Recovery day' || priorFocus.label.toLowerCase().includes('rest')
    if (!wasRestAdvice) return

    const coachAdvice = priorFocus.label.toLowerCase().includes('rest') ? 'rest' : 'easier'

    const logOverrides = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const rows = [
        ...todayHevy.map(() => ({
          user_id: user.id, date: todayStr, sport_type: 'strength',
          coach_advice: coachAdvice, user_action: 'trained',
          readiness_score_at_time: rawReadinessPct, recovery_score_at_time: recoveryDetail.pct,
        })),
        ...todayActivities.map(a => {
          const t = (a.sport_type ?? '').toLowerCase()
          const sport = t.includes('run') ? 'running' : (t.includes('ride') || t.includes('cycl')) ? 'cycling' : t.includes('swim') ? 'swimming' : 'running'
          return {
            user_id: user.id, date: todayStr, sport_type: sport,
            coach_advice: coachAdvice, user_action: 'trained',
            readiness_score_at_time: rawReadinessPct, recovery_score_at_time: recoveryDetail.pct,
          }
        }),
      ]

      if (rows.length > 0) {
        await supabase.from('coach_overrides').upsert(rows, { onConflict: 'user_id,date,sport_type' })
        overrideLoggedRef.current = true
      }
    }

    logOverrides()
  }, [todayHevy.length, todayActivities.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Personal learning profile — derived from the user's own history
  const personalProfile = useMemo(
    () => computePersonalProfile(gezondheid ?? [], activities, hevy, pastCalendarEvents),
    [gezondheid, activities, hevy, pastCalendarEvents]
  )

  return (
    <div className="flex flex-col gap-[18px]">
      {/* 1. Today's Recommendation — hero */}
      <TodaysPlanCard focus={todaysFocus} calendarEvents={calendarEvents} readinessPct={unifiedReadinessPct} biasApplied={biasApplied} />

      {/* 2. This Week */}
      <WeekSummaryCard
        weekCompleted={weekCompleted}
        weekUpcomingPlanned={weekUpcomingPlanned}
        sportRows={sportRows}
      />

      {/* 3. Readiness */}
      <RecoveryDetailCard recovery={recoveryDetail} physiology={physiologyReadiness} />

      {/* 4. What Kern learned about you */}
      <LearnedAboutYouCard profile={personalProfile} />
    </div>
  )
}

// ─── Running cards ────────────────────────────────────────────────────────────

function RunningVolumeHistoryCard({ weeks }: { weeks: ReturnType<typeof computeRunningVolumeHistory> }) {
  const maxKm = Math.max(...weeks.map(w => w.km), 1)
  const thisWeek = weeks[weeks.length - 1]
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">4-Week Volume</span>
        <div className="flex items-end gap-2" style={{ height: 64 }}>
          {weeks.map((w, i) => {
            const isThis = i === weeks.length - 1
            const barH = w.km > 0 ? Math.max(8, Math.round((w.km / maxKm) * 52)) : 4
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] font-semibold" style={{ color: isThis ? '#2dd4bf' : 'rgba(255,255,255,0.3)' }}>
                  {w.km > 0 ? `${w.km.toFixed(1)}` : '–'}
                </span>
                <div className="w-full rounded-[6px]"
                  style={{ height: barH, background: isThis ? '#2dd4bf' : 'rgba(255,255,255,0.15)' }} />
                <span className="text-[10px] text-white/35">{w.label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-[12px] pt-1 border-t border-white/[0.06]">
          <span className="text-white/40">{thisWeek.runs} run{thisWeek.runs !== 1 ? 's' : ''} this week</span>
          <span className="font-semibold text-teal-400">{thisWeek.km.toFixed(1)} km</span>
        </div>
      </div>
    </Card>
  )
}

function RunningHRCard({ hr }: { hr: ReturnType<typeof computeRunningHRTrend> }) {
  if (hr.avgHR30 === null) return null
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Heart Rate (30 days)</span>
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-[40px] font-bold text-red-400 leading-none">{hr.avgHR30}</span>
            <span className="text-[15px] font-semibold text-white/50">bpm avg</span>
          </div>
          {hr.earlyHR && hr.lateHR && (
            <div className="flex flex-col items-end gap-0.5 pb-1 text-right">
              <span className="text-[12px] text-white/40">First 2 weeks</span>
              <span className="text-[14px] font-semibold text-white/70">{hr.earlyHR} bpm</span>
              <span className="text-[12px] text-white/40">Last 2 weeks</span>
              <span className="text-[14px] font-semibold text-white/70">{hr.lateHR} bpm</span>
            </div>
          )}
        </div>
        {hr.trend && <span className="text-[13px] text-white/50">{hr.trend}</span>}
      </div>
    </Card>
  )
}

// ─── Cycling cards ────────────────────────────────────────────────────────────

function CyclingVolumeHistoryCard({ weeks }: { weeks: ReturnType<typeof computeCyclingVolumeHistory> }) {
  const maxKm = Math.max(...weeks.map(w => w.km), 1)
  const thisWeek = weeks[weeks.length - 1]
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">4-Week Volume</span>
        <div className="flex items-end gap-2" style={{ height: 64 }}>
          {weeks.map((w, i) => {
            const isThis = i === weeks.length - 1
            const barH = w.km > 0 ? Math.max(8, Math.round((w.km / maxKm) * 52)) : 4
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] font-semibold" style={{ color: isThis ? '#22d3ee' : 'rgba(255,255,255,0.3)' }}>
                  {w.km > 0 ? `${w.km.toFixed(0)}` : '–'}
                </span>
                <div className="w-full rounded-[6px]"
                  style={{ height: barH, background: isThis ? '#22d3ee' : 'rgba(255,255,255,0.15)' }} />
                <span className="text-[10px] text-white/35">{w.label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-[12px] pt-1 border-t border-white/[0.06]">
          <span className="text-white/40">{thisWeek.rides} ride{thisWeek.rides !== 1 ? 's' : ''} this week</span>
          <span className="font-semibold text-cyan-400">{thisWeek.km.toFixed(0)} km</span>
        </div>
      </div>
    </Card>
  )
}

function CyclingHRCard({ hr }: { hr: ReturnType<typeof computeCyclingHRTrend> }) {
  if (hr.avgHR30 === null) return null
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Heart Rate (30 days)</span>
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-[40px] font-bold text-red-400 leading-none">{hr.avgHR30}</span>
            <span className="text-[15px] font-semibold text-white/50">bpm avg</span>
          </div>
          {hr.earlyHR && hr.lateHR && (
            <div className="flex flex-col items-end gap-0.5 pb-1 text-right">
              <span className="text-[12px] text-white/40">First 2 weeks</span>
              <span className="text-[14px] font-semibold text-white/70">{hr.earlyHR} bpm</span>
              <span className="text-[12px] text-white/40">Last 2 weeks</span>
              <span className="text-[14px] font-semibold text-white/70">{hr.lateHR} bpm</span>
            </div>
          )}
        </div>
        {hr.trend && <span className="text-[13px] text-white/50">{hr.trend}</span>}
      </div>
    </Card>
  )
}

// ─── Swimming cards ───────────────────────────────────────────────────────────

function SwimmingVolumeHistoryCard({ weeks }: { weeks: ReturnType<typeof computeSwimmingVolumeHistory> }) {
  const maxM = Math.max(...weeks.map(w => w.meters), 1)
  const thisWeek = weeks[weeks.length - 1]
  const fmt = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)}k` : `${Math.round(m)}`
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">4-Week Volume</span>
        <div className="flex items-end gap-2" style={{ height: 64 }}>
          {weeks.map((w, i) => {
            const isThis = i === weeks.length - 1
            const barH = w.meters > 0 ? Math.max(8, Math.round((w.meters / maxM) * 52)) : 4
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] font-semibold" style={{ color: isThis ? '#60a5fa' : 'rgba(255,255,255,0.3)' }}>
                  {w.meters > 0 ? fmt(w.meters) : '–'}
                </span>
                <div className="w-full rounded-[6px]"
                  style={{ height: barH, background: isThis ? '#60a5fa' : 'rgba(255,255,255,0.15)' }} />
                <span className="text-[10px] text-white/35">{w.label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-[12px] pt-1 border-t border-white/[0.06]">
          <span className="text-white/40">{thisWeek.sessions} session{thisWeek.sessions !== 1 ? 's' : ''} this week</span>
          <span className="font-semibold text-blue-400">{thisWeek.meters >= 1000 ? `${(thisWeek.meters / 1000).toFixed(1)} km` : `${Math.round(thisWeek.meters)} m`}</span>
        </div>
      </div>
    </Card>
  )
}

function SwimmingPaceTrendCard({ pace }: { pace: ReturnType<typeof computeSwimmingPaceTrend> }) {
  if (!pace.earlyPace || !pace.latePace) return null
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Pace Trend (30 days)</span>
        <div className="flex items-center gap-6">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-white/40">2 weeks ago</span>
            <span className="text-[22px] font-bold text-white/60 leading-none">{pace.earlyPace}</span>
            <span className="text-[11px] text-white/30">/100m</span>
          </div>
          <span className="text-[22px] text-white/20">{pace.improved ? '→' : '→'}</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-white/40">Recent</span>
            <span className={`text-[22px] font-bold leading-none ${pace.improved ? 'text-blue-400' : 'text-red-400'}`}>{pace.latePace}</span>
            <span className="text-[11px] text-white/30">/100m</span>
          </div>
          <div className="ml-auto flex flex-col items-end gap-0.5">
            <span className="text-[22px]">{pace.improved ? '🏊' : '📉'}</span>
            <span className={`text-[12px] font-semibold ${pace.improved ? 'text-blue-400' : 'text-red-400'}`}>
              {pace.improved ? 'Faster' : 'Slower'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── Running ──────────────────────────────────────────────────────────────────

function RunningCoachCard({ readinessPct, suggestion, activities }: {
  readinessPct: number; suggestion: string; activities: Activity[]
}) {
  const c = readinessPct >= 85 ? '#4ade80' : readinessPct >= 70 ? '#facc15' : '#fb923c'
  const trend = computeRunning7DayTrend(activities)
  const lastRun = activities.filter(isRun).sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
  const hoursSince = lastRun ? Math.round((Date.now() - new Date(lastRun.start_date).getTime()) / 3600000) : null

  const details = readinessPct >= 85
    ? { duration: '40–60 min', zone: 'Zone 3–4 (tempo)' }
    : readinessPct >= 70
    ? { duration: '30–50 min', zone: 'Zone 2 (aerobic)' }
    : { duration: 'Rest', zone: '–' }

  const tomorrowPct = readinessPct >= 85 ? 68 : readinessPct >= 70 ? 80 : 92
  const tomorrowLabel = tomorrowPct >= 85 ? 'Harder training possible' : tomorrowPct >= 70 ? 'Easy run' : 'Rest day'

  const reasons: string[] = []
  if (hoursSince !== null && hoursSince < 36) reasons.push(`Last run ${hoursSince}h ago`)
  if (readinessPct >= 85) reasons.push('Well recovered — high intensity possible')
  else if (readinessPct >= 70) reasons.push('Well recovered — easy pace recommended')
  else reasons.push('Recovery is priority — keep it easy')
  if (trend.volPct !== null && trend.volPct > 20) reasons.push(`Volume +${trend.volPct}% vs last week — do not increase further`)

  return (
    <div className="p-5 rounded-[24px] border border-white/[0.12]" style={{ background: 'rgba(45,212,191,0.07)' }}>
      <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em] mb-4">Running Advice</p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex flex-col gap-1.5 p-3 rounded-[14px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <span className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.08em]">Today</span>
          <span className="text-[17px] font-bold text-white leading-tight">{suggestion}</span>
          <span className="text-[12px] font-semibold" style={{ color: c }}>{details.duration}</span>
          <span className="text-[11px] text-white/40">{details.zone}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-3 rounded-[14px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <span className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.08em]">Tomorrow</span>
          <span className="text-[15px] font-semibold text-white/80 leading-tight">{tomorrowLabel}</span>
          <div className="flex items-center gap-1.5 mt-auto">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: tomorrowPct >= 80 ? '#4ade80' : tomorrowPct >= 65 ? '#facc15' : '#fb923c' }} />
            <span className="text-[12px] text-white/40">Expected {tomorrowPct}%</span>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.08] pt-3">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.08em] mb-2">Why</p>
        <div className="flex flex-col gap-1.5">
          {reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-teal-400/60 text-[12px] mt-[2px] shrink-0">•</span>
              <span className="text-[13px] text-white/65 leading-snug">{r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function RunningSection({ activities, hevy = [] }: { activities: Activity[]; hevy?: HevyWorkout[] }) {
  const { data: gezondheid } = useSWR<HealthRow[]>('health-gezondheid', null)
  const recoveryDetail = computeRecoveryDetail(activities, hevy)
  const physiologyReadiness = computePhysiologyReadiness(gezondheid ?? [])
  const readinessPct = physiologyReadiness.score !== null
    ? Math.round(physiologyReadiness.score * 0.70 + recoveryDetail.pct * 0.30)
    : recoveryDetail.pct
  const runningSuggestion = readinessPct >= 85 ? 'Tempo run' : readinessPct >= 70 ? 'Easy run' : 'Rest day'

  const allRuns = activities.filter(isRun).sort((a, b) => b.start_date.localeCompare(a.start_date))
  const lastRun = allRuns[0] ?? null
  const trend = computeRunning7DayTrend(activities)

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const weekRuns = activities.filter(a => isRun(a) && a.start_date >= sevenDaysAgo)
  const cadenceRuns = weekRuns.filter(a => a.average_cadence)
  const avgCadence = cadenceRuns.length
    ? Math.round(cadenceRuns.reduce((s, a) => s + (a.average_cadence ?? 0), 0) / cadenceRuns.length * 2)
    : 0
  const efficiencyTrend = computeRunningEfficiencyTrend(activities)

  const bestRunDist = allRuns.length > 0 ? Math.max(...allRuns.map(a => a.distance ?? 0)) : 0
  const showProjections = allRuns.length >= 5 && bestRunDist >= 5000
  const projections = showProjections ? computeRaceProjections(activities) : null

  return (
    <div className="flex flex-col gap-6">
      <RunningCoachCard readinessPct={readinessPct} suggestion={runningSuggestion} activities={activities} />

      {lastRun && <LastRunCard run={lastRun} allRuns={allRuns} />}

      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">This week</span>
          <div className="flex gap-6">
            <div className="flex flex-col gap-0.5">
              <span className="text-[28px] font-bold text-white leading-none">{trend.runs7}</span>
              <span className="text-[12px] text-white/40">{trend.runs7 === 1 ? 'run' : 'runs'}</span>
            </div>
            {trend.vol7 > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[28px] font-bold text-teal-400 leading-none">{trend.vol7.toFixed(1)}</span>
                <span className="text-[12px] text-white/40">km</span>
              </div>
            )}
            {trend.volPct !== null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[28px] font-bold leading-none" style={{ color: trend.volPct > 15 ? '#fb923c' : trend.volPct < -10 ? '#60a5fa' : '#4ade80' }}>
                  {trend.volPct > 0 ? '+' : ''}{trend.volPct}%
                </span>
                <span className="text-[12px] text-white/40">vs last week</span>
              </div>
            )}
          </div>
          {trend.volPct !== null && (
            <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
              <span className="text-[12px] font-semibold text-white/30 uppercase tracking-[0.08em]">Status</span>
              <span className="text-[13px] font-semibold" style={{ color: trend.volPct > 15 ? '#fb923c' : trend.volPct < -10 ? '#60a5fa' : '#4ade80' }}>
                {trend.volPct > 15 ? 'Opbouwfase' : trend.volPct < -10 ? 'Afbouwfase' : 'Stabiele week'}
              </span>
            </div>
          )}
        </div>
      </Card>

      {avgCadence > 0 && (
        <Card>
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Loopmetriek</span>
            <div className="flex items-baseline gap-2">
              <span className="text-[36px] font-bold text-blue-400 leading-none">{avgCadence}</span>
              <span className="text-[15px] font-semibold text-white/50">spm</span>
              <span className="text-[13px] text-white/40 ml-1">cadans</span>
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
              <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Race Projecties</span>
              <span className="text-[12px] text-teal-400">Riegel</span>
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

function CyclingAdviceCard({ readinessPct, suggestion, activities }: {
  readinessPct: number; suggestion: string; activities: Activity[]
}) {
  const c = readinessPct >= 85 ? '#4ade80' : readinessPct >= 70 ? '#facc15' : '#fb923c'
  const lastRide = activities.filter(isRide).sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
  const hoursSince = lastRide ? Math.round((Date.now() - new Date(lastRide.start_date).getTime()) / 3600000) : null

  const details = readinessPct >= 85
    ? { duration: '60–90 min', intensity: 'High', zone: 'Zone 3–4' }
    : readinessPct >= 70
    ? { duration: '45–75 min', intensity: 'Moderate', zone: 'Zone 2' }
    : { duration: '20–40 min', intensity: 'Recovery', zone: 'Zone 1' }

  const tomorrowPct = readinessPct >= 85 ? 72 : readinessPct >= 70 ? 82 : 92
  const tomorrowLabel = tomorrowPct >= 85 ? 'Threshold training possible' : tomorrowPct >= 70 ? 'Zone 2 ride' : 'Recovery ride'
  const tomorrowColor = tomorrowPct >= 85 ? '#4ade80' : tomorrowPct >= 70 ? '#facc15' : '#fb923c'

  const reasons: string[] = []
  if (hoursSince !== null) reasons.push(`Last ride ${hoursSince}h ago`)
  if (readinessPct >= 85) reasons.push('Well recovered — threshold training possible')
  else if (readinessPct >= 70) reasons.push('Zone 2 builds aerobic base without stress')
  else reasons.push('Avoid high intensity — recovery priority')

  return (
    <div className="p-5 rounded-[24px] border border-white/[0.12]" style={{ background: 'rgba(34,211,238,0.07)' }}>
      <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em] mb-4">Cycling advice</p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex flex-col gap-1.5 p-3 rounded-[14px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <span className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.08em]">Today</span>
          <span className="text-[17px] font-bold text-white leading-tight">{suggestion}</span>
          <span className="text-[12px] font-semibold" style={{ color: c }}>{details.intensity}</span>
          <span className="text-[11px] text-white/40">{details.zone} · {details.duration}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-3 rounded-[14px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <span className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.08em]">Tomorrow</span>
          <span className="text-[15px] font-semibold text-white/80 leading-tight">{tomorrowLabel}</span>
          <div className="flex items-center gap-1.5 mt-auto">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: tomorrowColor }} />
            <span className="text-[12px] text-white/40">Expected {tomorrowPct}%</span>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.08] pt-3">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.08em] mb-2">Why</p>
        <div className="flex flex-col gap-1.5">
          {reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-cyan-400/60 text-[12px] mt-[2px] shrink-0">•</span>
              <span className="text-[13px] text-white/65 leading-snug">{r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CyclingSection({ activities, hevy = [] }: { activities: Activity[]; hevy?: HevyWorkout[] }) {
  const { data: gezondheid } = useSWR<HealthRow[]>('health-gezondheid', null)
  const recoveryDetail = computeRecoveryDetail(activities, hevy)
  const physiologyReadiness = computePhysiologyReadiness(gezondheid ?? [])
  const readinessPct = physiologyReadiness.score !== null
    ? Math.round(physiologyReadiness.score * 0.70 + recoveryDetail.pct * 0.30)
    : recoveryDetail.pct
  const cyclingSuggestion = readinessPct >= 85 ? 'Threshold training' : readinessPct >= 70 ? 'Zone 2 ride' : 'Recovery ride'

  const allRides = activities.filter(isRide).sort((a, b) => b.start_date.localeCompare(a.start_date))
  const lastRide = allRides[0] ?? null
  const trend = computeCyclingWeeklyTrend(activities)
  const ftp = computeFTP(activities)

  return (
    <div className="flex flex-col gap-6">
      <CyclingAdviceCard readinessPct={readinessPct} suggestion={cyclingSuggestion} activities={activities} />

      {lastRide && <LastRideCard ride={lastRide} allRides={allRides} />}

      <CyclingWeeklyTrendCard trend={trend} />

      {ftp && (
        <Card>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Geschatte FTP</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[40px] font-bold text-purple-400 leading-none">{ftp}</span>
              <span className="text-[17px] font-semibold text-white/50">W</span>
            </div>
            <span className="text-[13px] text-white/40">Schatting o.b.v. kJ/tijd op ritten langer dan 45 min</span>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Strength ─────────────────────────────────────────────────────────────────

function SplitRecommendationCard({ hevy }: { hevy: HevyWorkout[] }) {
  const muscleAdvice = computeMuscleGroupAdvice(hevy)
  const get = (label: string) => muscleAdvice.find(g => g.label === label)

  const pushScore = Math.round(((get('Chest')?.recovery ?? 100) + (get('Shoulders')?.recovery ?? 100)) / 2)
  const pullScore = Math.round(((get('Back')?.recovery ?? 100) + (get('Arms')?.recovery ?? 100)) / 2)
  const legsScore = get('Legs')?.recovery ?? 100

  const splits = [
    { key: 'Push', score: pushScore, groups: 'Chest + Shoulders', color: '#60a5fa', emoji: '💪' },
    { key: 'Pull', score: pullScore, groups: 'Back + Arms', color: '#2dd4bf', emoji: '🏋️' },
    { key: 'Legs', score: legsScore, groups: 'Quads + Glutes', color: '#4ade80', emoji: '🦵' },
  ].sort((a, b) => b.score - a.score)

  const best = splits[0]
  const isRest = best.score < 60

  const sc = (pct: number) => pct >= 80 ? '#4ade80' : pct >= 55 ? '#facc15' : '#f87171'
  const sl = (pct: number) => pct >= 80 ? 'Ready' : pct >= 55 ? 'Possible' : 'Recovery'

  return (
    <div className="p-5 rounded-[24px] border border-white/[0.12]" style={{ background: 'rgba(251,146,60,0.07)' }}>
      <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em] mb-4">Recommended split</p>

      <div className="flex items-center gap-3 mb-5">
        <span className="text-[42px] leading-none">{isRest ? '😴' : best.emoji}</span>
        <div>
          <span className="text-[24px] font-bold text-white">{isRest ? 'Rest day' : `${best.key} day`}</span>
          <p className="text-[13px] text-white/50 mt-0.5">
            {isRest ? 'Muscle recovery priority' : `${best.groups} recovered`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {splits.map(s => (
          <div key={s.key}
            className="flex flex-col gap-1.5 p-3 rounded-[12px]"
            style={{
              background: s.key === best.key && !isRest ? `${s.color}18` : 'rgba(255,255,255,0.04)',
              border: s.key === best.key && !isRest ? `1px solid ${s.color}40` : '1px solid transparent',
            }}>
            <span className="text-[14px] font-bold text-white">{s.key}</span>
            <span className="text-[11px] font-semibold" style={{ color: sc(s.score) }}>{sl(s.score)}</span>
            <span className="text-[10px] text-white/30">{s.score}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const MUSCLE_MAP = [
  { label: 'Legs',      keywords: ['squat','leg press','leg curl','leg extension','lunge','hamstring','quad','calf','glute','hip thrust','rdl','romanian','hack','step-up','split squat'], target: 12, color: '#2dd4bf' },
  { label: 'Chest',     keywords: ['bench','chest','fly','push-up','pushup','pec','cable cross'], target: 12, color: '#60a5fa' },
  { label: 'Back',      keywords: ['row','pull-up','pullup','lat pulldown','deadlift','back','chin-up','chinup','hyperextension','t-bar'], target: 12, color: '#22d3ee' },
  { label: 'Shoulders', keywords: ['shoulder','delt','lateral raise','front raise','face pull','overhead press','ohp','arnold','upright row'], target: 6, color: '#facc15' },
  { label: 'Arms',      keywords: ['curl','tricep','bicep','skull','hammer curl','preacher','tricep extension','pushdown'], target: 6, color: '#fb923c' },
]

const LIFT_COLORS = ['text-teal-400','text-blue-400','text-cyan-400','text-yellow-400','text-orange-400']

function matchMuscle(name: string): string | null {
  const lower = name.toLowerCase()
  for (const g of MUSCLE_MAP) {
    if (g.keywords.some(kw => lower.includes(kw))) return g.label
  }
  return null
}

export function StrengthSection({ hevy }: { hevy: HevyWorkout[] }) {
  const muscleAdvice = computeMuscleGroupAdvice(hevy)
  const keyLifts     = extractKeyLifts(hevy)
  const lastWorkout  = [...hevy].sort((a, b) => b.start_time.localeCompare(a.start_time))[0] ?? null
  const setBreakdown = computeWeeklySetBreakdown(hevy)

  const sc = (pct: number) => pct >= 80 ? '#4ade80' : pct >= 55 ? '#facc15' : '#f87171'
  const sl = (pct: number) => pct >= 80 ? 'Ready' : pct >= 55 ? 'Possible' : 'Recovery'

  return (
    <div className="flex flex-col gap-6">
      <SplitRecommendationCard hevy={hevy} />

      {muscleAdvice.length > 0 && (
        <Card>
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Muscle groups</span>
            {muscleAdvice.map(g => (
              <div key={g.label} className="flex items-center gap-3">
                <span className="text-[14px] text-white w-[80px] shrink-0">{g.label}</span>
                <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: `${g.recovery}%`, background: sc(g.recovery) }} />
                </div>
                <span className="text-[12px] font-semibold w-[52px] text-right shrink-0" style={{ color: sc(g.recovery) }}>
                  {sl(g.recovery)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {lastWorkout && <LastStrengthWorkoutCard workout={lastWorkout} allWorkouts={hevy} />}

      {keyLifts.length > 0 && (
        <Card>
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Estimated 1RM</span>
            {keyLifts.map(l => (
              <div key={l.name} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[15px] font-medium text-white">{l.name}</p>
                  <p className="text-[12px] text-white/40">{l.current1RM} kg</p>
                </div>
                <span className={`text-[13px] font-semibold ${l.color}`}>{l.trend}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <WeeklySetBreakdownCard breakdown={setBreakdown} />
    </div>
  )
}

// ─── History ──────────────────────────────────────────────────────────────────

function buildMonthlyInsight(activities: Activity[], hevy: HevyWorkout[], displayMonth: Date): string {
  const yr = displayMonth.getFullYear()
  const mo = displayMonth.getMonth()
  const inM = (d: string) => { const dt = new Date(d); return dt.getFullYear() === yr && dt.getMonth() === mo }
  const prevMonth = new Date(yr, mo - 1, 1)
  const inP = (d: string) => { const dt = new Date(d); return dt.getFullYear() === prevMonth.getFullYear() && dt.getMonth() === prevMonth.getMonth() }

  const mActs = activities.filter(a => inM(a.start_date))
  const mHevy = hevy.filter(h => inM(h.start_time))
  const pActs = activities.filter(a => inP(a.start_date))
  const pHevy = hevy.filter(h => inP(h.start_time))

  const mTotal = mActs.length + mHevy.length
  const pTotal = pActs.length + pHevy.length

  if (mTotal === 0) return 'No workouts logged this month yet.'

  const parts: string[] = []

  // Most frequent discipline
  const counts = [
    { name: 'Running', n: mActs.filter(isRun).length },
    { name: 'Cycling', n: mActs.filter(isRide).length },
    { name: 'Strength training', n: mHevy.length },
  ].filter(d => d.n > 0).sort((a, b) => b.n - a.n)
  if (counts.length > 0) {
    const top = counts[0]
    parts.push(`${top.name} was your most consistent discipline this month (${top.n} session${top.n !== 1 ? 's' : ''}).`)
  }

  // Frequency change vs previous month
  if (pTotal > 0) {
    const pct = Math.round((mTotal - pTotal) / pTotal * 100)
    if (Math.abs(pct) >= 10 && parts.length < 2) {
      parts.push(pct > 0 ? `Training frequency up ${pct}% vs last month.` : `Training frequency down ${Math.abs(pct)}% vs last month.`)
    }
  }

  // Running km change
  const mRunKm = mActs.filter(isRun).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const pRunKm = pActs.filter(isRun).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  if (mRunKm > 0 && pRunKm > 0 && parts.length < 2) {
    const pct = Math.round((mRunKm - pRunKm) / pRunKm * 100)
    if (Math.abs(pct) >= 15) {
      parts.push(pct > 0 ? `Running distance up ${pct}% vs last month.` : `Running distance down ${Math.abs(pct)}% vs last month.`)
    }
  }

  // Lifting volume change
  const mVol = mHevy.reduce((s, h) => s + (h.volume_kg ?? 0), 0)
  const pVol = pHevy.reduce((s, h) => s + (h.volume_kg ?? 0), 0)
  if (mVol > 0 && pVol > 0 && parts.length < 2) {
    const pct = Math.round((mVol - pVol) / pVol * 100)
    if (Math.abs(pct) >= 15) {
      parts.push(pct > 0 ? `Lifting volume up ${pct}% vs last month.` : `Lifting volume down ${Math.abs(pct)}% vs last month.`)
    }
  }

  return parts.join(' ') || `${mTotal} workout${mTotal !== 1 ? 's' : ''} this month. Keep building consistency.`
}

function calTypeColor(t: 'run' | 'ride' | 'strength'): string {
  return t === 'run' ? '#2dd4bf' : t === 'ride' ? '#60a5fa' : '#fb923c'
}

function WorkoutIcon({ type }: { type: 'run' | 'ride' | 'strength' }) {
  if (type === 'run') return <PersonStanding size={16} className="text-teal-400" />
  if (type === 'ride') return <Bike size={16} className="text-cyan-400" />
  return <Dumbbell size={16} className="text-orange-400" />
}

type LogFilter = 'all' | 'run' | 'ride' | 'strength'

export function HistorySection({ activities, hevy }: { activities: Activity[]; hevy: HevyWorkout[] }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [filter, setFilter] = useState<LogFilter>('all')
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

  const workoutDays = new Map<number, Set<'run' | 'ride' | 'strength'>>()
  activities.filter(a => (a.moving_time ?? 0) >= 60 && !isWeightTraining(a)).forEach(a => {
    if (!inMonth(a.start_date)) return
    const day = new Date(a.start_date).getDate()
    if (!workoutDays.has(day)) workoutDays.set(day, new Set())
    workoutDays.get(day)!.add(sportIcon(a.sport_type))
  })
  hevy.filter(h => (h.duration ?? 0) >= 60).forEach(h => {
    if (!inMonth(h.start_time)) return
    const day = new Date(h.start_time).getDate()
    if (!workoutDays.has(day)) workoutDays.set(day, new Set())
    workoutDays.get(day)!.add('strength')
  })

  const allItems = [
    ...activities.filter(a => (a.moving_time ?? 0) >= 60 && !isWeightTraining(a)).map(a => ({
      date: a.start_date, label: a.name,
      detail: [a.distance ? `${(a.distance / 1000).toFixed(1)} km` : null, a.moving_time ? formatDuration(a.moving_time) : null].filter(Boolean).join(' · '),
      type: sportIcon(a.sport_type) as LogFilter, relDate: relativeDay(a.start_date),
    })),
    ...hevy.filter(h => (h.duration ?? 0) >= 60).map(h => ({
      date: h.start_time, label: h.title ?? 'Strength',
      detail: [h.duration ? formatDuration(h.duration) : null, h.volume_kg ? `${Math.round(h.volume_kg).toLocaleString('en-US')} kg` : null].filter(Boolean).join(' · '),
      type: 'strength' as LogFilter, relDate: relativeDay(h.start_time),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const filtered = filter === 'all' ? allItems : allItems.filter(w => w.type === filter)

  // Consistency: active days in last 28d
  const last28 = new Date(Date.now() - 28 * 86400000).toISOString()
  const activeDays = new Set([
    ...activities.filter(a => a.start_date >= last28).map(a => a.start_date.slice(0, 10)),
    ...hevy.filter(h => h.start_time >= last28).map(h => h.start_time.slice(0, 10)),
  ]).size

  const filters: { key: LogFilter; label: string; color: string }[] = [
    { key: 'all', label: 'Alles', color: 'rgba(255,255,255,0.15)' },
    { key: 'run', label: 'Hardlopen', color: 'rgba(45,212,191,0.25)' },
    { key: 'ride', label: 'Fietsen', color: 'rgba(34,211,238,0.25)' },
    { key: 'strength', label: 'Kracht', color: 'rgba(251,146,60,0.25)' },
  ]

  const insight = buildMonthlyInsight(activities, hevy, displayMonth)

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Monthly pattern */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-orange-400 text-[14px]">✦</span>
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">Patroon</span>
          </div>
          <p className="text-[16px] text-white/85 leading-relaxed">{insight}</p>
        </div>
      </Card>

      {/* 2. Calendar */}
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
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} className="h-[42px]" />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const isToday = day === todayDay
              const types = workoutDays.get(day)
              const count = types?.size ?? 0
              const hasWorkout = count > 0
              const dotColor = count >= 3 ? '#fb923c' : count === 2 ? '#60a5fa' : '#2dd4bf'
              return (
                <div key={day} className="h-[42px] flex flex-col items-center justify-center gap-[2px]">
                  <div className="w-[28px] h-[28px] rounded-full flex items-center justify-center"
                    style={isToday && !hasWorkout ? { background: 'white' } : hasWorkout ? { background: dotColor } : {}}>
                    <span className="text-[12px] leading-none" style={{
                      fontWeight: hasWorkout || isToday ? 700 : 400,
                      color: isToday && !hasWorkout ? 'black' : hasWorkout ? 'white' : 'rgba(255,255,255,0.55)',
                    }}>{day}</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 pt-2 border-t border-white/[0.06]">
            {([['1', '#2dd4bf'], ['2', '#60a5fa'], ['3+', '#fb923c']] as const).map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-[8px] h-[8px] rounded-full" style={{ background: color }} />
                <span className="text-[11px] text-white/40">{label} sessie{label === '1' ? '' : 's'}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 3. Consistency strip */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Consistentie</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[36px] font-bold text-teal-400 leading-none">{activeDays}</span>
              <span className="text-[15px] text-white/50">actieve dagen</span>
            </div>
            <span className="text-[12px] text-white/30">Afgelopen 28 dagen</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[13px] font-semibold text-white/60">{allItems.length} sessies totaal</span>
            <span className="text-[12px] text-white/30">{(activeDays / 4).toFixed(1)}× per week gem.</span>
          </div>
        </div>
      </Card>

      {/* 4. Filter + All workouts */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            {filters.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all"
                style={{
                  background: filter === f.key ? f.color : 'rgba(255,255,255,0.06)',
                  color: filter === f.key ? 'white' : 'rgba(255,255,255,0.45)',
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-white/40 text-[15px] py-4 text-center">Geen activiteiten gevonden</p>
          ) : filtered.slice(0, 15).map((w, i) => (
            <div key={i} className="flex items-center gap-3"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingTop: i > 0 ? 12 : 0 }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <WorkoutIcon type={w.type as 'run' | 'ride' | 'strength'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-white truncate">{w.label}</p>
                <p className="text-[12px] text-white/40">{w.relDate}</p>
              </div>
              <span className="text-[12px] text-white/40 shrink-0 text-right max-w-[90px] truncate">{w.detail}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function localDateStr(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function relativeDay(iso: string): string {
  const workout = localDateStr(iso)
  const today = localDateStr(new Date().toISOString())
  const yesterday = localDateStr(new Date(Date.now() - 86400000).toISOString())
  if (workout === today) return 'Today'
  if (workout === yesterday) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ─── Swimming ─────────────────────────────────────────────────────────────────

function SwimmingReadinessCard({ readiness }: { readiness: { pct: number; suggestion: string } }) {
  const c = readiness.pct >= 85 ? '#4ade80' : readiness.pct >= 70 ? '#facc15' : '#fb923c'
  const label = readiness.pct >= 85 ? 'Optimal' : readiness.pct >= 70 ? 'Ready to train' : 'Slightly fatigued'
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Swimming Readiness</span>
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[40px] font-bold text-white leading-none">{readiness.pct}%</span>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-[15px] font-semibold" style={{ color: c }}>{label}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 pb-1">
            <span className="text-[12px] text-white/40">Recommended today</span>
            <span className="text-[15px] font-semibold text-blue-400">{readiness.suggestion}</span>
          </div>
        </div>
        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full" style={{ width: `${readiness.pct}%`, background: c }} />
        </div>
      </div>
    </Card>
  )
}

function LastSwimCard({ swim }: { swim: Activity }) {
  const pace = swim.average_speed ? formatPace100m(swim.average_speed) : null
  const dist = swim.distance ? `${(swim.distance / 1000).toFixed(2)} km` : null
  const dur = swim.moving_time ? formatDuration(swim.moving_time) : null
  const openWater = swim.sport_type?.toLowerCase().includes('open')
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Last Swim</span>
          {openWater && <span className="text-[11px] font-semibold text-cyan-400 px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,211,238,0.12)' }}>Open Water</span>}
        </div>
        <span className="text-[17px] font-semibold text-white leading-snug">{swim.name}</span>
        <span className="text-[12px] text-white/40">{formatDate(swim.start_date)}</span>
        <div className="flex gap-5 mt-1">
          {dist && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-white leading-none">{dist}</span><span className="text-[11px] text-white/40">Distance</span></div>}
          {pace && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-blue-400 leading-none">{pace}</span><span className="text-[11px] text-white/40">/100m</span></div>}
          {dur && <div className="flex flex-col gap-0.5"><span className="text-[20px] font-bold text-white leading-none">{dur}</span><span className="text-[11px] text-white/40">Duration</span></div>}
        </div>
        {swim.average_heartrate && (
          <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2">
            <span className="text-[13px] text-white/40">Avg HR</span>
            <span className="text-[13px] font-semibold text-red-400">{Math.round(swim.average_heartrate)} bpm</span>
          </div>
        )}
      </div>
    </Card>
  )
}

function SwimmingWeeklyTrendCard({ trend }: { trend: ReturnType<typeof computeSwimmingWeeklyTrend> }) {
  const pctColor = (trend.metersPct ?? 0) > 10 ? '#4ade80' : (trend.metersPct ?? 0) < -10 ? '#f87171' : 'rgba(255,255,255,0.5)'
  const distLabel = trend.meters7 >= 1000
    ? `${(trend.meters7 / 1000).toFixed(1)} km`
    : `${trend.meters7} m`
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">7-Day Overview</span>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-bold text-white leading-none">{trend.meters7 > 0 ? distLabel : '–'}</span>
            <span className="text-[11px] text-white/40">distance</span>
            {trend.metersPct !== null && (
              <span className="text-[12px] font-semibold" style={{ color: pctColor }}>
                {trend.metersPct > 0 ? '+' : ''}{trend.metersPct}% vs last week
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-bold text-blue-400 leading-none">{trend.avgPace7 ?? '–'}</span>
            <span className="text-[11px] text-white/40">avg /100m</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-bold text-white leading-none">{trend.sessions7}</span>
            <span className="text-[11px] text-white/40">sessions</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function SwimmingSection({ activities, hevy = [] }: { activities: Activity[]; hevy?: HevyWorkout[] }) {
  const { data: gezondheid } = useSWR<HealthRow[]>('health-gezondheid', null)
  const recoveryDetail = computeRecoveryDetail(activities, hevy)
  const physiologyReadiness = computePhysiologyReadiness(gezondheid ?? [])
  const readinessPct = physiologyReadiness.score !== null
    ? Math.round(physiologyReadiness.score * 0.70 + recoveryDetail.pct * 0.30)
    : recoveryDetail.pct
  const swimmingSuggestion = readinessPct >= 85 ? 'Sprint set' : readinessPct >= 70 ? 'Distance swim' : 'Recovery swim'
  const readiness = { pct: readinessPct, suggestion: swimmingSuggestion }

  const trend = computeSwimmingWeeklyTrend(activities)
  const allSwims = activities.filter(isSwim).sort((a, b) => b.start_date.localeCompare(a.start_date))
  const lastSwim = allSwims[0] ?? null
  const volumeHistory = computeSwimmingVolumeHistory(activities)
  const paceTrend = computeSwimmingPaceTrend(activities)

  if (allSwims.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <AiInsight text="Nog geen zwemdata. Log je eerste zwembeurt in Strava om inzichten te zien." />
        <Card>
          <p className="text-[15px] text-white/40 text-center py-6">
            Verbind Strava en log een zwembeurt om je voortgang bij te houden.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={buildSwimmingInsight(activities, readinessPct)} />
      <SwimmingReadinessCard readiness={readiness} />
      {lastSwim && <LastSwimCard swim={lastSwim} />}
      <SwimmingWeeklyTrendCard trend={trend} />
      <SwimmingVolumeHistoryCard weeks={volumeHistory} />
      <SwimmingPaceTrendCard pace={paceTrend} />
    </div>
  )
}
