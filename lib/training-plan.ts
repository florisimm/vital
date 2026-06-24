import { computeAdvice } from './training-algorithm'

export type Zones = {
  z2Speed: number | null
  thresholdSpeed: number | null
  longDist: number | null
}

export type ZoneTargets = {
  z2Minutes: number
  qualityMinutes: number
  updatedWeek?: number
  updatedYear?: number
}

export type ZoneProgress = {
  z2Minutes: number
  qualityMinutes: number
}

const SPORT_TYPES: Record<string, string[]> = {
  running:  ['run', 'virtualrun', 'trailrun'],
  cycling:  ['ride', 'virtualride', 'ebikeride', 'gravelride', 'mountainbikeride'],
  swimming: ['swim'],
}

function normalizeSport(s: string): string {
  return s.toLowerCase().replace(/_/g, '')
}

export function computeZones(activities: any[], sport: string, maxHR?: number): Zones {
  const types = SPORT_TYPES[sport] ?? []
  const sportActs = activities.filter(a => types.includes(normalizeSport(a.sport_type ?? '')))
  const withHR = sportActs.filter(a => a.average_heartrate && a.average_speed)
  const longestDist = sportActs.length > 0 ? Math.max(...sportActs.map(a => a.distance ?? 0)) : 0

  if (withHR.length < 3) {
    return { z2Speed: null, thresholdSpeed: null, longDist: longestDist > 0 ? longestDist : null }
  }

  const estimatedMaxHR = maxHR ?? Math.round(
    Math.max(...withHR.map(a => a.average_heartrate as number)) / 0.92
  )
  const avgSpd = (arr: typeof withHR) =>
    arr.length ? arr.reduce((s, a) => s + (a.average_speed as number), 0) / arr.length : null

  const z2Acts = withHR.filter(a => {
    const r = (a.average_heartrate as number) / estimatedMaxHR
    return r >= 0.60 && r <= 0.72
  })
  const thrActs = withHR.filter(a => {
    const r = (a.average_heartrate as number) / estimatedMaxHR
    return r >= 0.83 && r <= 0.92
  })

  return {
    z2Speed: avgSpd(z2Acts),
    thresholdSpeed: avgSpd(thrActs),
    longDist: longestDist > 0 ? longestDist : null,
  }
}

export function suggestZoneTargets(sport: string, freq: number, activities?: any[]): ZoneTargets {
  if (freq === 0) return { z2Minutes: 0, qualityMinutes: 0 }

  let avgSessionMin = 50
  if (activities?.length && (sport === 'running' || sport === 'cycling')) {
    const titleMap: Record<string, string> = { running: 'Easy Run', cycling: 'Endurance Ride' }
    const res = computeAdvice(sport as 'running' | 'cycling', activities, titleMap[sport])
    avgSessionMin = res.advice.durationMin
  }

  const totalMin = freq * avgSessionMin
  const z2Minutes = Math.max(30, Math.round((totalMin * 0.80) / 15) * 15)
  const qualityMinutes = Math.max(15, Math.round((totalMin * 0.20) / 15) * 15)
  return { z2Minutes, qualityMinutes }
}

function getWeekBounds(weekOffset = 0): { start: Date; end: Date } {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate() + diffToMon)
  thisMonday.setHours(0, 0, 0, 0)

  const start = new Date(thisMonday)
  start.setDate(start.getDate() + weekOffset * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

export function computeWeekProgress(
  activities: any[],
  sport: string,
  zones?: Zones,
  maxHR?: number,
  weekOffset = 0,
): ZoneProgress {
  const { start: weekStart, end: weekEnd } = getWeekBounds(weekOffset)
  const types = SPORT_TYPES[sport] ?? []

  const weekActs = activities.filter(a => {
    if (!a.start_date) return false
    const d = new Date(a.start_date)
    return d >= weekStart && d < weekEnd && types.includes(normalizeSport(a.sport_type ?? ''))
  })

  const allWithHR = activities.filter(a => a.average_heartrate)
  const estimatedMaxHR = maxHR ?? (allWithHR.length > 0
    ? Math.round(Math.max(...allWithHR.map(a => a.average_heartrate as number)) / 0.92)
    : 190)

  let z2Minutes = 0
  let qualityMinutes = 0

  for (const a of weekActs) {
    const durationMin = Math.round((a.moving_time ?? 0) / 60)
    if (durationMin < 5) continue

    let isZone2: boolean
    if (a.average_heartrate) {
      isZone2 = (a.average_heartrate as number) / estimatedMaxHR < 0.75
    } else if (zones?.z2Speed && a.average_speed) {
      isZone2 = (a.average_speed as number) <= (zones.z2Speed ?? 0) * 1.05
    } else {
      const name = (a.name ?? '').toLowerCase()
      const qualityKw = ['interval', 'tempo', 'ftp', 'speed', 'vo2', 'threshold', 'race', 'repeat', 'sprint']
      isZone2 = !qualityKw.some(kw => name.includes(kw))
    }

    if (isZone2) z2Minutes += durationMin
    else qualityMinutes += durationMin
  }

  return { z2Minutes, qualityMinutes }
}

export function applyWeeklyProgression(targets: ZoneTargets, adherencePct: number): ZoneTargets {
  if (adherencePct < 60) return targets
  const factor = adherencePct >= 90 ? 1.05 : 1.0
  const maxIncrement = 15
  return {
    ...targets,
    z2Minutes: Math.round(Math.min(targets.z2Minutes * factor, targets.z2Minutes + maxIncrement) / 5) * 5,
    qualityMinutes: Math.round(Math.min(targets.qualityMinutes * factor, targets.qualityMinutes + maxIncrement) / 5) * 5,
  }
}

export function getISOWeek(d: Date): number {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}
