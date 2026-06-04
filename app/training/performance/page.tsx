'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { trainingFetcher } from '../fetcher'
import { Card } from '@/components/ui'
import {
  computePerformanceScore, computeFTP, estimateVO2max, extractKeyLifts,
  computeRaceProjections, startOfWeek,
  type Activity, type HevyWorkout,
} from '../sections'

function computeStrengthScore(hevy: HevyWorkout[]): number | null {
  const lifts = extractKeyLifts(hevy)
  const refs: Record<string, number> = { 'Squat': 140, 'Bench Press': 100, 'Deadlift': 180 }
  let total = 0, count = 0
  for (const lift of lifts) {
    const ref = refs[lift.name]
    if (ref) { total += Math.min(lift.current1RM / ref, 1.5); count++ }
  }
  return count > 0 ? Math.round((total / count) * 100) : null
}

function parseTimeSecs(t: string): number {
  const parts = t.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return parts[0] * 60 + (parts[1] ?? 0)
}

function computeHyroxScore(activities: Activity[], hevy: HevyWorkout[]): number | null {
  const proj = computeRaceProjections(activities)
  const strScore = computeStrengthScore(hevy)

  let runScore = 0
  if (proj) {
    const secs = parseTimeSecs(proj['5K'])
    if (secs <= 18 * 60) runScore = 50
    else if (secs <= 25 * 60) runScore = Math.round(50 - ((secs - 18 * 60) / 420) * 20)
    else if (secs <= 35 * 60) runScore = Math.round(30 - ((secs - 25 * 60) / 600) * 20)
    else runScore = Math.max(5, 10 - Math.round((secs - 35 * 60) / 120))
  }

  const strengthScore = strScore ? Math.round(strScore / 2) : 0
  if (runScore === 0 && strengthScore === 0) return null
  return Math.min(100, runScore + strengthScore)
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
  const activities: Activity[] = data?.activities ?? []
  const hevy: HevyWorkout[] = data?.hevy ?? []

  const perf = computePerformanceScore(activities, hevy)
  const vo2max = estimateVO2max(activities)
  const ftp = computeFTP(activities)
  const projections = computeRaceProjections(activities)
  const lifts = extractKeyLifts(hevy)
  const strScore = computeStrengthScore(hevy)
  const hyroxScore = computeHyroxScore(activities, hevy)

  const weekStart = startOfWeek()
  const weekWorkouts = [
    ...activities.filter(a => a.start_date >= weekStart),
    ...hevy.filter(h => h.start_time >= weekStart),
  ].length

  const allTimes = [...activities.map(a => a.start_date), ...hevy.map(h => h.start_time)].sort().reverse()
  const hoursSince = allTimes.length ? (Date.now() - new Date(allTimes[0]).getTime()) / 3600000 : null

  const recoveryPct = hoursSince !== null
    ? hoursSince < 12 ? 45 : hoursSince < 24 ? 65 : hoursSince < 48 ? 82 : 95
    : 95

  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const recent14 = [...activities.filter(a => a.start_date >= fourteenDaysAgo), ...hevy.filter(h => h.start_time >= fourteenDaysAgo)]
  const consistencyPct = Math.min(Math.round((recent14.length / 6) * 100), 100)

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

      {/* VO2max + FTP */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="VO₂max est."
          value={vo2max ? `${vo2max}` : '–'}
          unit={vo2max ? 'ml/kg/min' : ''}
          sub={vo2max ? 'Daniels-Gilbert formula' : 'Need run data'}
          color="text-teal-400"
        />
        <StatCard
          label="Est. FTP"
          value={ftp ? `${ftp}` : '–'}
          unit={ftp ? 'W' : ''}
          sub={ftp ? 'From kJ/time on rides' : 'Need 45min+ rides'}
          color="text-cyan-400"
        />
      </div>

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

      {/* Strength + HYROX */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Strength Score"
          value={strScore ? `${strScore}` : '–'}
          unit={strScore ? '/100' : ''}
          sub={strScore ? 'Normalised 1RM composite' : 'Need lift data'}
          color="text-orange-400"
        />
        <StatCard
          label="HYROX Score"
          value={hyroxScore ? `${hyroxScore}` : '–'}
          unit={hyroxScore ? '/100' : ''}
          sub={hyroxScore ? 'Running + strength' : 'Need both sports'}
          color="text-yellow-400"
        />
      </div>

      {/* Recovery */}
      <StatCard
        label="Recovery"
        value={`${recoveryPct}%`}
        sub={hoursSince !== null ? `Last workout ${Math.round(hoursSince)}h ago` : 'No recent workout'}
        color={recoveryPct >= 85 ? 'text-teal-400' : recoveryPct >= 65 ? 'text-yellow-400' : 'text-orange-400'}
      />

      {/* Consistency */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-white/50">Training Consistency</span>
            <span className="text-[17px] font-bold text-white">{consistencyPct}%</span>
          </div>
          <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${consistencyPct}%`, background: consistencyPct >= 75 ? '#4ade80' : consistencyPct >= 50 ? '#facc15' : '#fb923c' }} />
          </div>
          <span className="text-[13px] text-white/40">{recent14.length} of 6 expected sessions in last 14 days</span>
        </div>
      </Card>

      {/* Key Lifts */}
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
