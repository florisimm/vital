'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { trainingFetcher } from '../fetcher'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import {
  computePerformanceScore, computeFTP, estimateVO2max, extractKeyLifts,
  computeRaceProjections, startOfWeek, formatDuration,
  type Activity, type HevyWorkout,
} from '../sections'

function isRun(a: Activity) { return a.sport_type?.toLowerCase().includes('run') ?? false }
function isRide(a: Activity) { const t = a.sport_type?.toLowerCase() ?? ''; return t.includes('ride') || t.includes('cycl') }

async function fetchStrengthSettings() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { squat: 140, bench: 100, deadlift: 180 }
  const { data } = await supabase
    .from('user_settings')
    .select('strength_squat_ref,strength_bench_ref,strength_deadlift_ref')
    .eq('user_id', user.id)
    .single()
  return {
    squat:    Number(data?.strength_squat_ref    ?? 140),
    bench:    Number(data?.strength_bench_ref    ?? 100),
    deadlift: Number(data?.strength_deadlift_ref ?? 180),
  }
}

function computeStrengthScore(hevy: HevyWorkout[], refs: { squat: number; bench: number; deadlift: number }): number | null {
  const lifts = extractKeyLifts(hevy)
  const refMap: Record<string, number> = { 'Squat': refs.squat, 'Bench Press': refs.bench, 'Deadlift': refs.deadlift }
  let total = 0, count = 0
  for (const lift of lifts) {
    const ref = refMap[lift.name]
    if (ref) { total += Math.min(lift.current1RM / ref, 1.5); count++ }
  }
  return count > 0 ? Math.round((total / count) * 100) : null
}

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

export default function PerformancePage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const { data: strengthRefs = { squat: 140, bench: 100, deadlift: 180 } } = useSWR('user-settings-strength', fetchStrengthSettings, { revalidateOnFocus: false, dedupingInterval: 300_000 })
  const activities: Activity[] = data?.activities ?? []
  const hevy: HevyWorkout[] = data?.hevy ?? []

  const perf = computePerformanceScore(activities, hevy)
  const vo2max = estimateVO2max(activities)
  const ftp = computeFTP(activities)
  const projections = computeRaceProjections(activities)
  const lifts = extractKeyLifts(hevy)
  const strScore = computeStrengthScore(hevy, strengthRefs)

  // Recovery
  const allTimes = [...activities.map(a => a.start_date), ...hevy.map(h => h.start_time)].sort().reverse()
  const hoursSince = allTimes.length ? Math.max(0, (Date.now() - new Date(allTimes[0]).getTime()) / 3600000) : null
  const recoveryPct = hoursSince !== null
    ? hoursSince < 12 ? 45 : hoursSince < 24 ? 65 : hoursSince < 48 ? 82 : 95
    : 95

  // Consistency (14-day)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const recent14 = [...activities.filter(a => a.start_date >= fourteenDaysAgo), ...hevy.filter(h => h.start_time >= fourteenDaysAgo)]
  const consistencyPct = Math.min(Math.round((recent14.length / 6) * 100), 100)

  // This week
  const weekStart = startOfWeek()
  const weekWorkouts = [
    ...activities.filter(a => a.start_date >= weekStart),
    ...hevy.filter(h => h.start_time >= weekStart),
  ].length

  // Monthly volume
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthActs = activities.filter(a => a.start_date >= monthStart)
  const monthHevy = hevy.filter(h => h.start_time >= monthStart)
  const monthTotal = monthActs.length + monthHevy.length
  const monthRunKm = monthActs.filter(isRun).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const monthRideKm = monthActs.filter(isRide).reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const monthSecs = [...monthActs, ...monthHevy].reduce((s, a: any) => s + (a.moving_time ?? a.duration ?? 0), 0)

  // 7-day training load vs prior 7 days
  const kj7 = activities.filter(a => a.start_date >= sevenDaysAgo).reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const kj14to7 = activities.filter(a => a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo).reduce((s, a) => s + (a.kilojoules ?? 0), 0)
  const sessions7 = [...activities.filter(a => a.start_date >= sevenDaysAgo), ...hevy.filter(h => h.start_time >= sevenDaysAgo)].length
  const sessions14to7 = [
    ...activities.filter(a => a.start_date >= fourteenDaysAgo && a.start_date < sevenDaysAgo),
    ...hevy.filter(h => h.start_time >= fourteenDaysAgo && h.start_time < sevenDaysAgo),
  ].length
  const loadPct = kj14to7 > 0 ? Math.round((kj7 - kj14to7) / kj14to7 * 100)
    : sessions14to7 > 0 ? Math.round((sessions7 - sessions14to7) / sessions14to7 * 100)
    : null
  const loadTrendColor = loadPct === null ? 'rgba(255,255,255,0.5)'
    : loadPct > 10 ? '#4ade80' : loadPct < -10 ? '#f87171' : 'rgba(255,255,255,0.5)'

  return (
    <TrainingDetailScreen title="Performance" active="Performance">
      {/* Performance Score */}
      <Card>
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-white/50 uppercase tracking-[0.08em]">Performance Score</span>
            <span className="text-[56px] font-bold text-white leading-none">{perf.score}</span>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-[8px] h-[8px] rounded-full" style={{ background: perf.color }} />
              <span className="text-[17px] font-semibold text-white">{perf.label}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 pb-1">
            <span className="text-[13px] text-white/40">This week</span>
            <span className="text-[22px] font-bold text-white">{weekWorkouts}/4</span>
            <span className="text-[13px] text-white/40">sessions</span>
          </div>
        </div>
        <div className="mt-4 h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${perf.score}%`, background: perf.color }} />
        </div>
      </Card>

      {/* Recovery + Consistency */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Recovery"
          value={`${recoveryPct}%`}
          sub={hoursSince !== null ? (hoursSince < 1 ? 'Just now' : `Last workout ${Math.round(hoursSince)}h ago`) : 'No recent workout'}
          color={recoveryPct >= 85 ? 'text-teal-400' : recoveryPct >= 65 ? 'text-yellow-400' : 'text-orange-400'}
        />
        <StatCard
          label="Consistency"
          value={`${consistencyPct}%`}
          sub={`${recent14.length} sessions in 14 days`}
          color={consistencyPct >= 75 ? 'text-teal-400' : consistencyPct >= 50 ? 'text-yellow-400' : 'text-orange-400'}
        />
      </div>

      {/* Monthly Volume */}
      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Monthly Volume</span>
          <div className="flex gap-5 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <span className="text-[26px] font-bold text-white leading-none">{monthTotal}</span>
              <span className="text-[12px] text-white/40">workouts</span>
            </div>
            {monthRunKm > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[26px] font-bold text-teal-400 leading-none">{monthRunKm.toFixed(0)}</span>
                <span className="text-[12px] text-white/40">km running</span>
              </div>
            )}
            {monthRideKm > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[26px] font-bold text-cyan-400 leading-none">{monthRideKm.toFixed(0)}</span>
                <span className="text-[12px] text-white/40">km cycling</span>
              </div>
            )}
            {monthSecs > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[26px] font-bold text-white/70 leading-none">{formatDuration(monthSecs)}</span>
                <span className="text-[12px] text-white/40">total time</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Training Load */}
      <Card>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Training Load</span>
          <div className="flex items-end justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[26px] font-bold text-white leading-none">{sessions7}</span>
              <span className="text-[13px] text-white/50">sessions this week</span>
            </div>
            {loadPct !== null && (
              <span className="text-[14px] font-semibold" style={{ color: loadTrendColor }}>
                {loadPct > 0 ? '+' : ''}{loadPct}% vs last week
              </span>
            )}
          </div>
          {kj7 > 0 && (
            <span className="text-[13px] text-white/40">{Math.round(kj7).toLocaleString('en-US')} kJ output this week</span>
          )}
        </div>
      </Card>

      {/* VO2max and/or FTP — only when data exists */}
      {(vo2max || ftp) && (
        <div className={`grid gap-3 ${vo2max && ftp ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {vo2max && (
            <StatCard
              label="VO₂max est."
              value={`${vo2max}`}
              unit="ml/kg/min"
              sub="Daniels-Gilbert formula"
              color="text-teal-400"
            />
          )}
          {ftp && (
            <StatCard
              label="Est. FTP"
              value={`${ftp}`}
              unit="W"
              sub="From kJ/time on rides"
              color="text-cyan-400"
            />
          )}
        </div>
      )}

      {/* Race Projections */}
      {projections && (
        <Card>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold text-white/50">Race Projections</span>
              <span className="text-[12px] text-teal-400">Riegel formula</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { dist: '5K', time: projections['5K'] },
                { dist: '10K', time: projections['10K'] },
                { dist: 'Half', time: projections['Half'] },
                { dist: 'Marathon', time: projections['Marathon'] },
              ].map(p => (
                <div key={p.dist} className="flex flex-col items-center gap-1">
                  <span className="text-[15px] font-bold text-white leading-tight text-center">{p.time}</span>
                  <span className="text-[11px] text-white/40">{p.dist}</span>
                  <span className="text-[11px] font-medium text-teal-400">Projected</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Strength Score — only when lift data exists */}
      {strScore !== null && (
        <StatCard
          label="Strength Score"
          value={`${strScore}`}
          unit="/100"
          sub="Normalised 1RM composite"
          color="text-orange-400"
        />
      )}

      {/* Estimated 1RM */}
      {lifts.length > 0 && (
        <Card>
          <div className="flex flex-col gap-3">
            <span className="text-[15px] font-semibold text-white/50">Estimated 1RM</span>
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
    </TrainingDetailScreen>
  )
}
