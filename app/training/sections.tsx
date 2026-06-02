'use client'

import { useState } from 'react'
import { TrendingUp, Timer, Dumbbell, Bike, PersonStanding, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, SectionHeader, BigMetricCard, MetricRow, MinimalWorkoutList } from '@/components/ui'

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

export function SmallCard({ title, value, unit = '', detail, Icon, tint }: {
  title: string; value: string; unit?: string; detail: string
  Icon: React.ElementType; tint: string
}) {
  return (
    <Card className="flex-1">
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

// ─── Overview ─────────────────────────────────────────────────────────────────

export function OverviewSection({ activities, hevy }: { activities: Activity[]; hevy: HevyWorkout[] }) {
  const weekStart = startOfWeek()
  const weekActivities = activities.filter(a => a.start_date >= weekStart)
  const weekKm = weekActivities.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000

  const upcoming = activities
    .filter(a => a.start_date >= new Date().toISOString())
    .slice(0, 3)
    .map(a => {
      const label = new Date(a.start_date).toLocaleDateString('nl-NL', { weekday: 'short' })
      const km = a.distance ? ` · ${(a.distance / 1000).toFixed(0)} km` : ''
      return `${label} · ${a.name}${km}`
    })

  const workouts = upcoming.length > 0 ? upcoming : ['Today · 10 km aerobic', 'Tue · Strength foundation', 'Thu · 45 min Zone 2']

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="w-1/2">
        <BigMetricCard
          title="Weekly volume"
          value={weekKm > 0 ? `${weekKm.toFixed(1)} km` : '68.4 km'}
          delta={weekActivities.length > 0 ? `${weekActivities.length} activiteiten deze week` : '+8% vs last week'}
          Icon={TrendingUp}
        />
      </div>
      <MetricRow title="Training load"     value="Balanced" detail="Acute load is productive" />
      <MetricRow title="Performance trend" value="+2.1%"    detail="Running economy improving" />
      <MetricRow title="Personal record"   value="10K"      detail="Projected 42:30" />
      <MinimalWorkoutList title="Upcoming workouts" workouts={workouts} />
    </div>
  )
}

// ─── Running ──────────────────────────────────────────────────────────────────

export function RunningSection({ activities }: { activities: Activity[] }) {
  const weekStart = startOfWeek()
  const weekRuns = activities.filter(a => a.sport_type?.toLowerCase().includes('run') && a.start_date >= weekStart)
  const weekKm = weekRuns.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const avgSpeedRuns = weekRuns.filter(a => a.average_speed)
  const avgSpeed = avgSpeedRuns.length ? avgSpeedRuns.reduce((s, a) => s + (a.average_speed ?? 0), 0) / avgSpeedRuns.length : 0
  const cadenceRuns = weekRuns.filter(a => a.average_cadence)
  const avgCadence = cadenceRuns.length ? Math.round(cadenceRuns.reduce((s, a) => s + (a.average_cadence ?? 0), 0) / cadenceRuns.length * 2) : 178

  const prs = [
    { dist: '5K', time: '20:15', projected: false },
    { dist: '10K', time: '42:30', projected: true },
    { dist: 'Half', time: '1:35:20', projected: false },
    { dist: 'Marathon', time: '3:28:00', projected: true },
  ]

  const paceZones = [
    { label: 'Easy', percent: 0.40, color: '#4ade80' },
    { label: 'Moderate', percent: 0.30, color: '#facc15' },
    { label: 'Tempo', percent: 0.18, color: '#fb923c' },
    { label: 'Threshold', percent: 0.10, color: '#f87171' },
    { label: 'Interval', percent: 0.02, color: '#f472b6' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text="Running economy improving. Cadence is optimal at 178 spm. Focus on maintaining Zone 2 effort for aerobic base building." />

      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold text-white/50">Personal Records</span>
          <div className="grid grid-cols-4 gap-2">
            {prs.map(pr => (
              <div key={pr.dist} className="flex flex-col items-center gap-1">
                <span className="text-[16px] font-bold text-white">{pr.time}</span>
                <span className="text-[11px] text-white/40">{pr.dist}</span>
                <span className={`text-[11px] font-medium ${pr.projected ? 'text-teal-400' : 'text-white/30'}`}>
                  {pr.projected ? 'Projected' : 'Set'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Weekly Distance" value={weekKm > 0 ? weekKm.toFixed(1) : '48.2'} unit="km" detail="Running" Icon={PersonStanding} tint="text-teal-400" />
        <SmallCard title="Avg Pace" value={avgSpeed > 0 ? formatPace(avgSpeed) : '4:52'} unit="/km" detail="This week" Icon={TrendingUp} tint="text-blue-400" />
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-white/50">Running Metrics</span>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Cadence', value: `${avgCadence}`, unit: 'spm', color: '#60a5fa' },
              { label: 'Stride', value: '1.14', unit: 'm', color: '#2dd4bf' },
              { label: 'Oscillation', value: '8.4', unit: 'cm', color: '#fb923c' },
              { label: 'GCT', value: '242', unit: 'ms', color: '#a78bfa' },
            ].map(m => (
              <div key={m.label} className="flex flex-col items-center gap-1">
                <span className="text-[22px] font-bold leading-none" style={{ color: m.color }}>{m.value}</span>
                <span className="text-[11px] text-white/40">{m.unit}</span>
                <span className="text-[11px] text-white/40">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold text-white/50">Pace Zones</span>
          {paceZones.map(z => <ZoneBar key={z.label} label={z.label} percent={z.percent} color={z.color} />)}
        </div>
      </Card>
    </div>
  )
}

// ─── Cycling ──────────────────────────────────────────────────────────────────

export function CyclingSection({ activities }: { activities: Activity[] }) {
  const weekStart = startOfWeek()
  const weekRides = activities.filter(a => a.sport_type?.toLowerCase().includes('ride') && a.start_date >= weekStart)
  const weekKm = weekRides.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const weekElev = weekRides.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)
  const weekSecs = weekRides.reduce((s, a) => s + (a.moving_time ?? 0), 0)
  const avgSpeedMs = weekRides.filter(a => a.average_speed).length
    ? weekRides.filter(a => a.average_speed).reduce((s, a) => s + (a.average_speed ?? 0), 0) / weekRides.filter(a => a.average_speed).length
    : 0

  const powerZones = [
    { label: 'Active Recovery', percent: 0.15, color: '#9ca3af' },
    { label: 'Endurance', percent: 0.35, color: '#4ade80' },
    { label: 'Tempo', percent: 0.28, color: '#facc15' },
    { label: 'Threshold', percent: 0.17, color: '#fb923c' },
    { label: 'VO₂ Max', percent: 0.05, color: '#f87171' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text="Cycling volume is below optimal range. Add one 90-minute endurance ride this week to maintain base fitness." />

      <div>
        <Bike size={22} className="text-cyan-400 mb-3" />
        <div className="flex items-baseline gap-2">
          <span className="text-[56px] font-bold text-white leading-none">{weekKm > 0 ? weekKm.toFixed(0) : '182'}</span>
          <span className="text-[20px] font-semibold text-white/50">km this week</span>
        </div>
        <span className="text-[15px] font-medium text-cyan-400">
          {weekKm > 0 ? `${weekRides.length} rides` : '−12% vs target'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Duration" value={weekSecs > 0 ? formatDuration(weekSecs) : '6h 10m'} detail="This week" Icon={Timer} tint="text-blue-400" />
        <SmallCard title="Elevation" value={weekElev > 0 ? Math.round(weekElev).toLocaleString('nl-NL') : '2,340'} unit="m" detail="Climbing" Icon={TrendingUp} tint="text-orange-400" />
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-white/50">Power Distribution</span>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Avg Power', value: '182', unit: 'W', color: '#22d3ee' },
              { label: 'Normalized', value: '204', unit: 'W', color: '#60a5fa' },
              { label: 'Max 5s', value: '842', unit: 'W', color: '#fb923c' },
              { label: 'Max 20m', value: '276', unit: 'W', color: '#a78bfa' },
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

      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Avg Speed" value={avgSpeedMs > 0 ? (avgSpeedMs * 3.6).toFixed(1) : '29.4'} unit="km/h" detail="This week" Icon={TrendingUp} tint="text-yellow-400" />
        <SmallCard title="Est. FTP" value="248" unit="W" detail="3.4 W/kg" Icon={Bike} tint="text-purple-400" />
      </div>
    </div>
  )
}

// ─── Strength ─────────────────────────────────────────────────────────────────

export function StrengthSection({ hevy }: { hevy: HevyWorkout[] }) {
  const weekStart = startOfWeek()
  const weekHevy = hevy.filter(h => h.start_time >= weekStart)
  const totalSets = weekHevy.reduce((s, h) => s + (h.sets ?? 0), 0)
  const totalVolume = weekHevy.reduce((s, h) => s + (h.volume_kg ?? 0), 0)

  const muscleGroups = [
    { label: 'Legs', sets: 15, target: 12, color: '#2dd4bf' },
    { label: 'Chest', sets: 8, target: 12, color: '#60a5fa' },
    { label: 'Back', sets: 10, target: 12, color: '#22d3ee' },
    { label: 'Shoulders', sets: 5, target: 6, color: '#facc15' },
    { label: 'Arms', sets: 4, target: 6, color: '#fb923c' },
  ]

  const keyLifts = [
    { name: 'Back Squat', weight: '120 kg', reps: '5×5', trend: '↑ 5 kg', color: 'text-teal-400' },
    { name: 'Bench Press', weight: '85 kg', reps: '4×6', trend: 'Stable', color: 'text-blue-400' },
    { name: 'Deadlift', weight: '155 kg', reps: '3×5', trend: '↑ 10 kg', color: 'text-cyan-400' },
    { name: 'Overhead Press', weight: '55 kg', reps: '3×8', trend: 'Stable', color: 'text-yellow-400' },
    { name: 'Pull-Up', weight: 'BW +15 kg', reps: '3×6', trend: '↑ 2.5 kg', color: 'text-orange-400' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text="Upper body volume is below target. Add one pressing movement and one pulling movement to Thursday's session." />

      <div>
        <Dumbbell size={22} className="text-orange-400 mb-3" />
        <div className="flex items-baseline gap-2">
          <span className="text-[56px] font-bold text-white leading-none">{totalSets || 42}</span>
          <span className="text-[20px] font-semibold text-white/50">sets this week</span>
        </div>
        <span className="text-[15px] font-medium text-orange-400">Target: 48 sets</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Volume Load" value={totalVolume > 0 ? Math.round(totalVolume).toLocaleString('nl-NL') : '18,240'} unit="kg" detail="Total lifted" Icon={TrendingUp} tint="text-orange-400" />
        <SmallCard title="Sessions" value={`${weekHevy.length || 3}`} detail="of 4 planned" Icon={Timer} tint="text-blue-400" />
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-white/50">Muscle Group Distribution</span>
          {muscleGroups.map(g => (
            <div key={g.label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[15px] text-white">{g.label}</span>
                <span className="text-[13px] font-medium" style={{ color: g.sets >= g.target ? g.color : 'rgba(255,255,255,0.4)' }}>
                  {g.sets}/{g.target} sets
                </span>
              </div>
              <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(g.sets / g.target, 1) * 100}%`, background: g.color, opacity: g.sets >= g.target ? 1 : 0.5 }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold text-white/50">Key Lifts</span>
          {keyLifts.map(l => (
            <div key={l.name} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }} />
              <div className="flex-1">
                <p className="text-[15px] font-medium text-white">{l.name}</p>
                <p className="text-[12px] text-white/40">{l.weight} · {l.reps}</p>
              </div>
              <span className={`text-[13px] font-semibold ${l.color}`}>{l.trend}</span>
            </div>
          ))}
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

  // Map: day → list of workout types in that month
  const workoutDays = new Map<number, ('run' | 'ride' | 'strength')[]>()
  activities.forEach(a => {
    const d = new Date(a.start_date)
    if (d.getFullYear() === displayMonth.getFullYear() && d.getMonth() === displayMonth.getMonth()) {
      const day = d.getDate()
      const type = sportIcon(a.sport_type)
      workoutDays.set(day, [...(workoutDays.get(day) ?? []), type])
    }
  })
  hevy.forEach(h => {
    const d = new Date(h.start_time)
    if (d.getFullYear() === displayMonth.getFullYear() && d.getMonth() === displayMonth.getMonth()) {
      const day = d.getDate()
      workoutDays.set(day, [...(workoutDays.get(day) ?? []), 'strength'])
    }
  })

  // Recent workouts last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const allRecent = [
    ...activities.map(a => ({ date: a.start_date, label: a.name, duration: a.moving_time ? formatDuration(a.moving_time) : '–', type: sportIcon(a.sport_type) as 'run' | 'ride' | 'strength', relDate: relativeDay(a.start_date) })),
    ...hevy.map(h => ({ date: h.start_time, label: h.title ?? 'Strength', duration: h.duration ? formatDuration(h.duration) : '–', type: 'strength' as const, relDate: relativeDay(h.start_time) })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

  const monthActivities = activities.filter(a => { const d = new Date(a.start_date); return d.getFullYear() === displayMonth.getFullYear() && d.getMonth() === displayMonth.getMonth() })
  const monthHevy = hevy.filter(h => { const d = new Date(h.start_time); return d.getFullYear() === displayMonth.getFullYear() && d.getMonth() === displayMonth.getMonth() })
  const monthKm = monthActivities.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const monthSecs = [...monthActivities, ...monthHevy].reduce((s, a: any) => s + (a.moving_time ?? a.duration ?? 0), 0)
  const monthKcal = monthActivities.reduce((s, a) => s + ((a.kilojoules ?? 0) * 0.239), 0)

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text="Consistency score is 87% over 90 days. 3 missed sessions in May. Best completion rate on running workouts." />

      {/* Calendar */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <button onClick={() => setMonthOffset(o => o - 1)}
              className="w-8 h-8 flex items-center justify-center">
              <ChevronLeft size={18} className="text-white/50" />
            </button>
            <span className="text-[17px] font-bold text-white">{monthName}</span>
            <button onClick={() => setMonthOffset(o => o + 1)}
              className="w-8 h-8 flex items-center justify-center">
              <ChevronRight size={18} className="text-white/50" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[12px] font-semibold text-white/40 pb-2">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} className="h-[44px]" />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const isToday = day === todayDay
              const hasWorkout = workoutDays.has(day)
              const showCircle = isToday || hasWorkout

              return (
                <div key={day} className="h-[44px] flex flex-col items-center justify-center gap-[3px]">
                  <div
                    className="w-[34px] h-[34px] rounded-full flex items-center justify-center"
                    style={showCircle ? { background: 'white' } : {}}
                  >
                    <span
                      className="text-[14px] leading-none"
                      style={{
                        fontWeight: showCircle ? 700 : 400,
                        color: showCircle ? 'black' : 'rgba(255,255,255,0.75)',
                      }}
                    >
                      {day}
                    </span>
                  </div>
                  {/* Teal dot for workouts (shown below circle — only visible for today since circle covers it for workout days) */}
                  {hasWorkout && isToday && (
                    <div className="w-[5px] h-[5px] rounded-full bg-black" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* Recent workouts */}
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
              { label: 'Workouts', value: `${monthActivities.length + monthHevy.length}`, color: 'text-teal-400' },
              { label: 'Distance', value: monthKm > 0 ? `${monthKm.toFixed(0)} km` : '212 km', color: 'text-blue-400' },
              { label: 'Duration', value: monthSecs > 0 ? formatDuration(monthSecs) : '21h', color: 'text-orange-400' },
              { label: 'Calories', value: monthKcal > 0 ? `${(monthKcal / 1000).toFixed(1)}K` : '14.2K', color: 'text-red-400' },
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
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
}
