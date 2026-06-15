'use client'

import useSWR from 'swr'
import { Card } from '@/components/ui'
import {
  extractKeyLifts, startOfWeek, formatDuration,
  type Activity, type HevyWorkout,
} from './sections'
import { trainingFetcher } from './fetcher'
import { computePhysiologyReadiness, type HealthRow } from '@/lib/readiness'

function isRun(a: Activity) { return a.sport_type?.toLowerCase().includes('run') ?? false }
function isRide(a: Activity) { const t = a.sport_type?.toLowerCase() ?? ''; return t.includes('ride') || t.includes('cycl') }

function StatCard({ label, value, unit, sub, color = 'text-white' }: {
  label: string; value: string; unit?: string; sub?: string; color?: string
}) {
  return (
    <Card className="flex-1">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">{label}</span>
        <div className="flex items-baseline gap-1">
          <span className={`text-[26px] font-bold leading-none ${color}`}>{value}</span>
          {unit && <span className="text-[13px] font-semibold text-white/50">{unit}</span>}
        </div>
        {sub && <span className="text-[12px] text-white/40 leading-snug">{sub}</span>}
      </div>
    </Card>
  )
}

export function PerformanceSection() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const { data: healthRows = [] } = useSWR<HealthRow[]>('health-gezondheid', null, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const activities: Activity[] = data?.activities ?? []
  const hevy: HevyWorkout[] = data?.hevy ?? []
  const lifts = extractKeyLifts(hevy)

  // Readiness (unified score with training load integration)
  const physiologyReadiness = computePhysiologyReadiness(healthRows, activities, hevy)
  const recoveryPct = physiologyReadiness.score

  // Consistency (14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const recent14 = [
    ...activities.filter(a => a.start_date >= fourteenDaysAgo),
    ...hevy.filter(h => h.start_time >= fourteenDaysAgo),
  ]
  const consistencyPct = Math.min(Math.round((recent14.length / 6) * 100), 100)

  // This week
  const weekStart = startOfWeek()
  const weekWorkouts = [
    ...activities.filter(a => a.start_date >= weekStart),
    ...hevy.filter(h => h.start_time >= weekStart),
  ]
  const weekSecs = weekWorkouts.reduce((s, a: any) => s + (a.moving_time ?? a.duration ?? 0), 0)

  // Avg sessions/week (last 4 weeks)
  const twentyEightDaysAgo = new Date(Date.now() - 28 * 86400000).toISOString()
  const sessions28 = [
    ...activities.filter(a => a.start_date >= twentyEightDaysAgo),
    ...hevy.filter(h => h.start_time >= twentyEightDaysAgo),
  ]
  const avgPerWeek = (sessions28.length / 4).toFixed(1)

  // Total training hours (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const last30 = [
    ...activities.filter(a => a.start_date >= thirtyDaysAgo),
    ...hevy.filter(h => h.start_time >= thirtyDaysAgo),
  ]
  const totalSecs30 = last30.reduce((s, a: any) => s + (a.moving_time ?? a.duration ?? 0), 0)
  const totalHours30 = (totalSecs30 / 3600).toFixed(1)

  // Monthly trend
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()

  const thisMonthActs = activities.filter(a => a.start_date >= monthStart)
  const thisMonthHevy = hevy.filter(h => h.start_time >= monthStart)
  const prevMonthActs = activities.filter(a => a.start_date >= prevMonthStart && a.start_date < monthStart)
  const prevMonthHevy = hevy.filter(h => h.start_time >= prevMonthStart && h.start_time < monthStart)

  const thisMonthSessions = thisMonthActs.length + thisMonthHevy.length
  const prevMonthSessions = prevMonthActs.length + prevMonthHevy.length
  const thisMonthSecs = [...thisMonthActs, ...thisMonthHevy].reduce((s, a: any) => s + (a.moving_time ?? a.duration ?? 0), 0)
  const prevMonthSecs = [...prevMonthActs, ...prevMonthHevy].reduce((s, a: any) => s + (a.moving_time ?? a.duration ?? 0), 0)
  const thisMonthRunKm = thisMonthActs.filter(isRun).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const prevMonthRunKm = prevMonthActs.filter(isRun).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const thisMonthRideKm = thisMonthActs.filter(isRide).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const prevMonthRideKm = prevMonthActs.filter(isRide).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000

  const pctChange = (curr: number, prev: number) => prev > 0 ? Math.round((curr - prev) / prev * 100) : null
  const sessionTrend = pctChange(thisMonthSessions, prevMonthSessions)
  const hoursTrend   = pctChange(thisMonthSecs, prevMonthSecs)
  const runKmTrend   = pctChange(thisMonthRunKm, prevMonthRunKm)
  const rideKmTrend  = pctChange(thisMonthRideKm, prevMonthRideKm)

  const trendColor = (pct: number | null) =>
    pct === null ? 'text-white/30' : pct > 5 ? 'text-green-400' : pct < -5 ? 'text-red-400' : 'text-white/40'
  const trendLabel = (pct: number | null) =>
    pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct}%`

  const thisMonthHours = (thisMonthSecs / 3600).toFixed(1)

  return (
    <div className="flex flex-col gap-6">

      {/* Readiness + Consistency */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Readiness"
          value={`${recoveryPct ?? '–'}%`}
          sub={physiologyReadiness.label}
          color={recoveryPct && recoveryPct >= 80 ? 'text-teal-400' : recoveryPct && recoveryPct >= 65 ? 'text-yellow-400' : 'text-orange-400'}
        />
        <StatCard
          label="Consistency"
          value={`${consistencyPct}%`}
          sub={`${recent14.length} sessions in 14 days`}
          color={consistencyPct >= 75 ? 'text-teal-400' : consistencyPct >= 50 ? 'text-yellow-400' : 'text-orange-400'}
        />
      </div>

      {/* Avg sessions/week + total hours */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Avg / week"
          value={avgPerWeek}
          unit="sessions"
          sub="Last 4 weeks"
          color={Number(avgPerWeek) >= 4 ? 'text-teal-400' : Number(avgPerWeek) >= 2.5 ? 'text-yellow-400' : 'text-white'}
        />
        <StatCard
          label="Training hours"
          value={totalHours30}
          unit="h"
          sub="Last 30 days"
          color="text-white"
        />
      </div>

      {/* This week */}
      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">This week</span>
          <div className="flex gap-5 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <span className="text-[26px] font-bold text-white leading-none">{weekWorkouts.length}</span>
              <span className="text-[12px] text-white/40">sessions</span>
            </div>
            {weekSecs > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[26px] font-bold text-white/70 leading-none">{formatDuration(weekSecs)}</span>
                <span className="text-[12px] text-white/40">total time</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Monthly trend */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Monthly trend</span>
            <span className="text-[12px] text-white/30">vs last month</span>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white/60">Sessions</span>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-white">{thisMonthSessions}</span>
                <span className={`text-[13px] font-semibold ${trendColor(sessionTrend)}`}>{trendLabel(sessionTrend)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white/60">Training hours</span>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-white">{thisMonthHours}h</span>
                <span className={`text-[13px] font-semibold ${trendColor(hoursTrend)}`}>{trendLabel(hoursTrend)}</span>
              </div>
            </div>
            {thisMonthRunKm > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-white/60">Running</span>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-teal-400">{thisMonthRunKm.toFixed(0)} km</span>
                  <span className={`text-[13px] font-semibold ${trendColor(runKmTrend)}`}>{trendLabel(runKmTrend)}</span>
                </div>
              </div>
            )}
            {thisMonthRideKm > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-white/60">Cycling</span>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-cyan-400">{thisMonthRideKm.toFixed(0)} km</span>
                  <span className={`text-[13px] font-semibold ${trendColor(rideKmTrend)}`}>{trendLabel(rideKmTrend)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Estimated 1RM */}
      {lifts.length > 0 && (
        <Card>
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Estimated 1RM</span>
            {lifts.map(l => (
              <div key={l.name} className="flex items-center justify-between">
                <span className="text-[15px] text-white">{l.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[15px] text-white/50">{l.current1RM} kg</span>
                  <span className={`text-[13px] font-semibold ${l.color}`}>{l.trend}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

    </div>
  )
}
