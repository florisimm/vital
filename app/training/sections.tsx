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

  const totalKm = activities.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000

  const upcoming = activities
    .filter(a => a.start_date >= new Date().toISOString())
    .slice(0, 3)
    .map(a => {
      const label = new Date(a.start_date).toLocaleDateString('nl-NL', { weekday: 'short' })
      const km = a.distance ? ` · ${(a.distance / 1000).toFixed(0)} km` : ''
      return `${label} · ${a.name}${km}`
    })

  // 5 meest recente activiteiten (Strava + Hevy gemengd)
  const allRecent = [
    ...activities.map(a => ({
      date: a.start_date,
      label: a.name,
      meta: [
        a.distance ? `${(a.distance / 1000).toFixed(1)} km` : null,
        a.moving_time ? formatDuration(a.moving_time) : null,
      ].filter(Boolean).join(' · '),
    })),
    ...hevy.map(h => ({
      date: h.start_time,
      label: h.title ?? 'Strength',
      meta: h.sets ? `${h.sets} sets` : '',
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-2 gap-3">
        <BigMetricCard
          title="Deze week"
          value={weekKm > 0 ? `${weekKm.toFixed(1)} km` : '—'}
          delta={weekActivities.length > 0 ? `${weekActivities.length} activiteiten` : 'Nog geen training'}
          Icon={TrendingUp}
        />
        <BigMetricCard
          title="30 dagen"
          value={totalKm > 0 ? `${totalKm.toFixed(0)} km` : '—'}
          delta={`${activities.length + hevy.length} activiteiten`}
          Icon={TrendingUp}
        />
      </div>

      {upcoming.length > 0 && (
        <MinimalWorkoutList title="Upcoming workouts" workouts={upcoming} />
      )}

      {allRecent.length > 0 && (
        <Card>
          <div className="flex flex-col gap-3">
            <SectionHeader title="Recent" />
            {allRecent.map((w, i) => (
              <MetricRow key={i} title={w.label} value={w.meta} detail={relativeDay(w.date)} />
            ))}
          </div>
        </Card>
      )}

      {activities.length === 0 && hevy.length === 0 && (
        <p className="text-white/40 text-[15px] text-center py-8">Geen trainingsdata gevonden</p>
      )}
    </div>
  )
}

// ─── Running ──────────────────────────────────────────────────────────────────

export function RunningSection({ activities }: { activities: Activity[] }) {
  const weekStart = startOfWeek()
  const allRuns = activities.filter(a => a.sport_type?.toLowerCase().includes('run'))
  const weekRuns = allRuns.filter(a => a.start_date >= weekStart)

  if (allRuns.length === 0) {
    return <p className="text-white/40 text-[15px] text-center py-8">Geen loopdata gevonden</p>
  }

  const totalKm = allRuns.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const weekKm = weekRuns.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000

  const avgSpeedRuns = allRuns.filter(a => a.average_speed)
  const avgSpeed = avgSpeedRuns.length
    ? avgSpeedRuns.reduce((s, a) => s + (a.average_speed ?? 0), 0) / avgSpeedRuns.length
    : 0

  const cadenceRuns = allRuns.filter(a => a.average_cadence)
  const avgCadence = cadenceRuns.length
    ? Math.round(cadenceRuns.reduce((s, a) => s + (a.average_cadence ?? 0), 0) / cadenceRuns.length * 2)
    : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        <SmallCard
          title="30 dagen"
          value={totalKm > 0 ? totalKm.toFixed(1) : '—'}
          unit={totalKm > 0 ? 'km' : ''}
          detail={`${allRuns.length} runs`}
          Icon={PersonStanding}
          tint="text-teal-400"
        />
        <SmallCard
          title="Gem. tempo"
          value={avgSpeed > 0 ? formatPace(avgSpeed) : '—'}
          unit={avgSpeed > 0 ? '/km' : ''}
          detail="30 dagen"
          Icon={TrendingUp}
          tint="text-blue-400"
        />
        {weekKm > 0 && (
          <SmallCard
            title="Deze week"
            value={weekKm.toFixed(1)}
            unit="km"
            detail={`${weekRuns.length} runs`}
            Icon={PersonStanding}
            tint="text-orange-400"
          />
        )}
        {avgCadence > 0 && (
          <SmallCard title="Gem. cadans" value={`${avgCadence}`} unit="spm" detail="30 dagen" Icon={PersonStanding} tint="text-purple-400" />
        )}
      </div>
    </div>
  )
}

// ─── Cycling ──────────────────────────────────────────────────────────────────

export function CyclingSection({ activities }: { activities: Activity[] }) {
  const weekStart = startOfWeek()
  const allRides = activities.filter(a =>
    a.sport_type?.toLowerCase().includes('ride') || a.sport_type?.toLowerCase().includes('cycl')
  )
  const weekRides = allRides.filter(a => a.start_date >= weekStart)

  if (allRides.length === 0) {
    return <p className="text-white/40 text-[15px] text-center py-8">Geen fietsdata gevonden</p>
  }

  const totalKm = allRides.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
  const totalSecs = allRides.reduce((s, a) => s + (a.moving_time ?? 0), 0)
  const totalElev = allRides.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)
  const weekKm = weekRides.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000

  const avgSpeedRides = allRides.filter(a => a.average_speed)
  const avgSpeedMs = avgSpeedRides.length
    ? avgSpeedRides.reduce((s, a) => s + (a.average_speed ?? 0), 0) / avgSpeedRides.length
    : 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Bike size={22} className="text-cyan-400 mb-3" />
        <div className="flex items-baseline gap-2">
          <span className="text-[56px] font-bold text-white leading-none">{totalKm.toFixed(0)}</span>
          <span className="text-[20px] font-semibold text-white/50">km · 30 dagen</span>
        </div>
        <span className="text-[15px] font-medium text-cyan-400">
          {allRides.length} {allRides.length === 1 ? 'rit' : 'ritten'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {totalSecs > 0 && (
          <SmallCard title="Rijduur" value={formatDuration(totalSecs)} detail="30 dagen" Icon={Timer} tint="text-blue-400" />
        )}
        {totalElev > 0 && (
          <SmallCard title="Hoogtemeters" value={Math.round(totalElev).toLocaleString('nl-NL')} unit="m" detail="30 dagen" Icon={TrendingUp} tint="text-orange-400" />
        )}
        {avgSpeedMs > 0 && (
          <SmallCard title="Gem. snelheid" value={(avgSpeedMs * 3.6).toFixed(1)} unit="km/h" detail="30 dagen" Icon={TrendingUp} tint="text-yellow-400" />
        )}
        {weekKm > 0 && (
          <SmallCard title="Deze week" value={weekKm.toFixed(1)} unit="km" detail={`${weekRides.length} ritten`} Icon={Bike} tint="text-cyan-400" />
        )}
      </div>
    </div>
  )
}

// ─── Strength ─────────────────────────────────────────────────────────────────

export function StrengthSection({ hevy }: { hevy: HevyWorkout[] }) {
  const weekStart = startOfWeek()
  const weekHevy = hevy.filter(h => h.start_time >= weekStart)

  if (hevy.length === 0) {
    return <p className="text-white/40 text-[15px] text-center py-8">Geen krachttraining gevonden</p>
  }

  const totalSets = hevy.reduce((s, h) => s + (h.sets ?? 0), 0)
  const totalVolume = hevy.reduce((s, h) => s + (h.volume_kg ?? 0), 0)
  const weekSets = weekHevy.reduce((s, h) => s + (h.sets ?? 0), 0)
  const weekVolume = weekHevy.reduce((s, h) => s + (h.volume_kg ?? 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Dumbbell size={22} className="text-orange-400 mb-3" />
        <div className="flex items-baseline gap-2">
          <span className="text-[56px] font-bold text-white leading-none">{totalSets}</span>
          <span className="text-[20px] font-semibold text-white/50">sets · 30 dagen</span>
        </div>
        <span className="text-[15px] font-medium text-orange-400">
          {hevy.length} {hevy.length === 1 ? 'sessie' : 'sessies'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {totalVolume > 0 && (
          <SmallCard title="Volume" value={Math.round(totalVolume).toLocaleString('nl-NL')} unit="kg" detail="30 dagen" Icon={TrendingUp} tint="text-orange-400" />
        )}
        <SmallCard title="Sessies" value={`${hevy.length}`} detail="30 dagen" Icon={Timer} tint="text-blue-400" />
        {weekSets > 0 && (
          <SmallCard title="Deze week" value={`${weekSets}`} unit="sets" detail={`${weekHevy.length} sessies`} Icon={Dumbbell} tint="text-yellow-400" />
        )}
        {weekVolume > 0 && (
          <SmallCard title="Volume week" value={Math.round(weekVolume).toLocaleString('nl-NL')} unit="kg" detail="Deze week" Icon={TrendingUp} tint="text-purple-400" />
        )}
      </div>
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
              { label: 'Distance', value: monthKm > 0 ? `${monthKm.toFixed(0)} km` : '—', color: 'text-blue-400' },
              { label: 'Duration', value: monthSecs > 0 ? formatDuration(monthSecs) : '—', color: 'text-orange-400' },
              { label: 'Calories', value: monthKcal > 0 ? `${(monthKcal / 1000).toFixed(1)}K` : '—', color: 'text-red-400' },
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
