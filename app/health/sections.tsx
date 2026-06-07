'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { BedDouble, Activity, Heart, Scale, Footprints, Flame, Timer, Moon, Zap, ArrowUpRight } from 'lucide-react'
import { Card, SectionHeader, MetricTile } from '@/components/ui'
import { healthFetcher } from './fetcher'

export type GezondheidsRow = {
  datum: string
  stappen: number | null
  gewicht: number | null
  hartslag_rust: number | null
  hrv_rmssd: number | null
  slaap_minuten: number | null
  slaap_score: number | null
  slaap_diep: number | null
  slaap_licht: number | null
  slaap_rem: number | null
}

const SWR_OPTS = { revalidateOnFocus: false, dedupingInterval: 60_000 }

// ─── Shared helpers ───────────────────────────────────────────────────────────

function AiInsight({ text }: { text: string }) {
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

function HeroMetric({ value, label, note, Icon, tint }: {
  value: string; label: string; note: string; Icon: React.ElementType; tint: string
}) {
  return (
    <div className="flex flex-col gap-3">
      <Icon size={22} className={tint} />
      <span className="text-[56px] font-bold text-white leading-none">{value}</span>
      <span className="text-[20px] font-semibold text-white">{label}</span>
      <span className={`text-[15px] font-medium ${tint}`}>{note}</span>
    </div>
  )
}

function SmallCard({ title, value, unit = '', detail, Icon, tint }: {
  title: string; value: string; unit?: string; detail: string; Icon: React.ElementType; tint: string
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

function StageBar({ label, duration, percent, tint }: { label: string; duration: string; percent: number; tint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium text-white">{label}</span>
        <span className={`text-[15px] font-semibold ${tint}`}>{duration}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className={`h-full rounded-full ${tint.replace('text-', 'bg-')} opacity-80`} style={{ width: `${percent * 100}%` }} />
      </div>
    </div>
  )
}

function ZoneBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="text-[13px] text-white/70">{label}</span>
        <span className="text-[13px] font-semibold" style={{ color }}>{Math.round(percent * 100)}%</span>
      </div>
      <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${percent * 100}%`, background: color }} />
      </div>
    </div>
  )
}

function RingChart({ progress, color, label, value }: { progress: number; color: string; label: string; value: string }) {
  const r = 30, circ = 2 * Math.PI * r, dash = Math.min(progress, 1) * circ
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-[76px] h-[76px]">
        <svg viewBox="0 0 76 76" className="w-full h-full -rotate-90">
          <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="8" />
          <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold" style={{ color }}>
          {Math.round(progress * 100)}%
        </span>
      </div>
      <span className="text-[12px] font-semibold text-white">{label}</span>
      <span className="text-[11px] text-white/40 text-center">{value}</span>
    </div>
  )
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

function fmtMin(min: number | null) {
  if (!min) return '–'
  const h = Math.floor(min / 60), m = min % 60
  return `${h}h ${m}m`
}

export function SleepSection() {
  const { data: rows = [] } = useSWR<GezondheidsRow[]>('health-gezondheid', healthFetcher, SWR_OPTS)

  const sleepRows = rows.filter(r => r.slaap_minuten != null).slice(0, 7)
  const latest = sleepRows[0]
  const totalMin = latest?.slaap_minuten ?? null
  const score = latest?.slaap_score ?? null
  const deep = latest?.slaap_diep ?? null
  const light = latest?.slaap_licht ?? null
  const rem = latest?.slaap_rem ?? null
  const wake = totalMin && deep && light && rem ? Math.max(0, totalMin - deep - light - rem) : null
  const total = totalMin ?? 1

  const avgMin = sleepRows.length
    ? Math.round(sleepRows.reduce((s, r) => s + (r.slaap_minuten ?? 0), 0) / sleepRows.length)
    : null

  const trendHeights = sleepRows.map(r => r.slaap_minuten ?? 0)
  const maxH = trendHeights.length ? Math.max(...trendHeights, 1) : 1

  const days = sleepRows.map(r => {
    const d = new Date(r.datum)
    return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]
  }).reverse()
  const trendRev = [...trendHeights].reverse()

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={totalMin ? `Last night: ${fmtMin(totalMin)} sleep, score ${score ?? '–'}.` : 'Connect Fitbit to see sleep data.'} />
      <HeroMetric value={score ? String(score) : '–'} label="Sleep Score" note={totalMin ? fmtMin(totalMin) : '–'} Icon={BedDouble} tint="text-indigo-400" />
      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-white/50">Sleep Stages</span>
          <StageBar label="Deep"  duration={fmtMin(deep)}  percent={deep  ? deep  / total : 0} tint="text-indigo-400" />
          <StageBar label="REM"   duration={fmtMin(rem)}   percent={rem   ? rem   / total : 0} tint="text-purple-400" />
          <StageBar label="Light" duration={fmtMin(light)} percent={light ? light / total : 0} tint="text-blue-400"   />
          <StageBar label="Awake" duration={fmtMin(wake)}  percent={wake  ? wake  / total : 0} tint="text-white/40"   />
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Duration"  value={totalMin ? `${Math.floor(total / 60)}h` : '–'} unit={totalMin ? `${total % 60}m` : ''} detail="Last night" Icon={Timer} tint="text-blue-400" />
        <SmallCard title="Deep"      value={deep ? `${deep}` : '–'} unit="min" detail="Deep sleep" Icon={Moon}     tint="text-indigo-400" />
        <SmallCard title="REM"       value={rem ? `${rem}` : '–'} unit="min" detail="REM sleep"  Icon={Activity} tint="text-purple-400" />
        <SmallCard title="7-day avg" value={avgMin ? `${Math.floor(avgMin / 60)}h` : '–'} unit={avgMin ? `${avgMin % 60}m` : ''} detail="Average" Icon={Zap} tint="text-teal-400" />
      </div>
      {trendRev.length > 1 && (
        <Card>
          <SectionHeader title="7-Day Trend" detail={avgMin ? `avg ${fmtMin(avgMin)}` : ''} />
          <div className="flex items-end gap-2 h-20 mt-4">
            {trendRev.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full rounded-[4px]" style={{ height: `${(h / maxH) * 64}px`, background: i === trendRev.length - 1 ? '#818cf8' : 'rgba(255,255,255,0.15)' }} />
                <span className="text-[10px] text-white/40">{days[i]}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

export function RecoverySection() {
  const { data: rows = [] } = useSWR<GezondheidsRow[]>('health-gezondheid', healthFetcher, SWR_OPTS)

  const latest = rows[0]
  const hrv = latest?.hrv_rmssd ?? null
  const restingHR = latest?.hartslag_rust ?? null
  const sleepScore = latest?.slaap_score ?? null
  const sleepMin = latest?.slaap_minuten ?? null

  // Simple readiness score: HRV 40% + resting HR 30% + sleep 30%
  let recoveryScore: number | null = null
  if (hrv || restingHR || sleepScore) {
    let score = 0, weight = 0
    if (hrv) { score += Math.min(hrv / 80, 1) * 40; weight += 40 }
    if (restingHR) { score += Math.max(0, (100 - restingHR) / 50) * 30; weight += 30 }
    if (sleepScore) { score += (sleepScore / 100) * 30; weight += 30 }
    recoveryScore = weight > 0 ? Math.round((score / weight) * 100) : null
  }

  const hrvOk = hrv ? hrv >= 35 : null
  const hrOk = restingHR ? restingHR <= 65 : null
  const sleepOk = sleepMin ? sleepMin >= 420 : null

  const factors = [
    { label: 'HRV',             status: hrv ? `${Math.round(hrv)} ms` : '–',            ok: hrvOk  },
    { label: 'Resting HR',      status: restingHR ? `${restingHR} bpm` : '–',           ok: hrOk   },
    { label: 'Sleep quality',   status: sleepScore ? `${sleepScore}%` : '–',            ok: sleepOk },
    { label: 'Sleep duration',  status: sleepMin ? fmtMin(sleepMin) : '–',              ok: sleepOk },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={recoveryScore ? `Recovery score ${recoveryScore} — based on HRV, resting HR, and sleep quality.` : 'Connect Fitbit to see recovery data.'} />
      <HeroMetric value={recoveryScore ? String(recoveryScore) : '–'} label="Recovery Score" note={recoveryScore ? (recoveryScore >= 70 ? 'Good to train' : recoveryScore >= 50 ? 'Moderate' : 'Rest recommended') : '–'} Icon={Heart} tint="text-teal-400" />
      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="HRV"        value={hrv ? Math.round(hrv).toString() : '–'}       unit={hrv ? 'ms' : ''} detail="Daily RMSSD"  Icon={Activity} tint="text-green-400"  />
        <SmallCard title="Resting HR" value={restingHR ? String(restingHR) : '–'}          unit={restingHR ? 'bpm' : ''} detail="Last night" Icon={Heart}    tint="text-pink-400"   />
        <SmallCard title="Sleep"      value={sleepMin ? fmtMin(sleepMin) : '–'}            detail="Duration"      Icon={Moon}     tint="text-indigo-400" />
        <SmallCard title="Score"      value={sleepScore ? String(sleepScore) : '–'}        unit={sleepScore ? '%' : ''} detail="Sleep efficiency" Icon={Flame} tint="text-orange-400" />
      </div>
      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold text-white/50">Readiness Factors</span>
          {factors.map(f => (
            <div key={f.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={f.ok === null ? 'text-white/30' : f.ok ? 'text-green-400' : 'text-yellow-400'}>
                  {f.ok === null ? '○' : f.ok ? '✓' : '−'}
                </span>
                <span className="text-[15px] text-white">{f.label}</span>
              </div>
              <span className={`text-[14px] font-medium ${f.ok === null ? 'text-white/30' : f.ok ? 'text-green-400' : 'text-yellow-400'}`}>{f.status}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ─── Heart ────────────────────────────────────────────────────────────────────

export function HeartSection() {
  const { data: rows = [] } = useSWR<GezondheidsRow[]>('health-gezondheid', healthFetcher, SWR_OPTS)

  const hrRows = rows.filter(r => r.hartslag_rust != null).slice(0, 7)
  const latest = hrRows[0]
  const restingHR = latest?.hartslag_rust ?? null
  const hrv = latest?.hrv_rmssd ?? null

  const avgHR = hrRows.length
    ? Math.round(hrRows.reduce((s, r) => s + (r.hartslag_rust ?? 0), 0) / hrRows.length)
    : null
  const minHR = hrRows.length ? Math.min(...hrRows.map(r => r.hartslag_rust ?? 999)) : null
  const trend = restingHR && avgHR ? restingHR - avgHR : null

  const maxBarH = hrRows.length ? Math.max(...hrRows.map(r => r.hartslag_rust ?? 0), 1) : 1
  const hrDays = [...hrRows].reverse().map(r => {
    const d = new Date(r.datum)
    return { day: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()], val: r.hartslag_rust ?? 0 }
  })

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={restingHR ? `Resting HR ${restingHR} bpm${hrv ? `, HRV ${Math.round(hrv)} ms` : ''}.${trend !== null ? ` ${trend > 0 ? '+' : ''}${trend} vs 7-day avg.` : ''}` : 'Connect Fitbit to see heart data.'} />
      <div className="grid grid-cols-2 gap-3">
        <MetricTile title="Resting HR" value={restingHR ? String(restingHR) : '–'} unit={restingHR ? 'bpm' : ''} note={trend !== null ? `${trend > 0 ? '+' : ''}${trend} vs avg` : '–'} Icon={Heart}    tint="text-pink-400"  />
        <MetricTile title="HRV"        value={hrv ? Math.round(hrv).toString() : '–'} unit={hrv ? 'ms' : ''} note="Daily RMSSD" Icon={Activity} tint="text-green-400" />
      </div>
      {hrDays.length > 1 && (
        <Card>
          <SectionHeader title="7-Day Resting HR" detail={avgHR ? `avg ${avgHR} bpm` : ''} />
          <div className="flex items-end gap-2 h-20 mt-4">
            {hrDays.map(({ day, val }, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full rounded-[4px]" style={{ height: `${(val / maxBarH) * 64}px`, background: i === hrDays.length - 1 ? '#f472b6' : 'rgba(255,255,255,0.15)' }} />
                <span className="text-[10px] text-white/40">{day}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="7-day avg HR" value={avgHR ? String(avgHR) : '–'} unit={avgHR ? 'bpm' : ''} detail="Resting average" Icon={Heart} tint="text-pink-400" />
        <SmallCard title="Best HR"      value={minHR && minHR < 999 ? String(minHR) : '–'} unit={minHR && minHR < 999 ? 'bpm' : ''} detail="7-day low" Icon={Zap} tint="text-red-400" />
      </div>
    </div>
  )
}

// ─── Weight ───────────────────────────────────────────────────────────────────

export function WeightSection({ rows }: { rows: GezondheidsRow[] }) {
  const [period, setPeriod] = useState<7 | 14 | 30>(14)

  const weightRows = rows.filter(r => r.gewicht != null).slice(0, period).reverse()
  const weights = weightRows.map(r => Number(r.gewicht))
  const latest = weights[weights.length - 1]
  const oldest = weights[0]
  const avg = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0
  const min = weights.length ? Math.min(...weights) : 0
  const max = weights.length ? Math.max(...weights) : 0
  const change = latest && oldest ? latest - oldest : 0

  const displayWeight = latest ?? null

  const composition = [
    { label: 'BMI',       value: '–',  unit: '',   sub: '',   color: '#2dd4bf' },
    { label: 'Lean Mass', value: '–',  unit: 'kg', sub: '',   color: '#60a5fa' },
    { label: 'Fat Mass',  value: '–',  unit: 'kg', sub: '',   color: '#fb923c' },
    { label: 'Body Fat',  value: '–',  unit: '%',  sub: '',   color: '#facc15' },
    { label: 'Bone Mass', value: '–',  unit: 'kg', sub: '',   color: '#9ca3af' },
    { label: 'Water',     value: '–',  unit: '%',  sub: '',   color: '#22d3ee' },
  ]

  const chartWeights = weights
  const chartMin = weights.length ? Math.min(...weights) : 0
  const chartMax = weights.length ? Math.max(...weights) : 0

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text="–" />

      {/* Hero */}
      <div className="flex flex-col gap-2">
        <Scale size={22} className="text-cyan-400" />
        <div className="flex items-baseline gap-1">
          <span className="text-[56px] font-bold text-white leading-none">{displayWeight ? displayWeight.toFixed(1) : '–'}</span>
          <span className="text-[24px] font-semibold text-white/50 ml-1">kg</span>
        </div>
        <span className="text-[15px] font-medium text-cyan-400">
          {change !== 0 ? `${change > 0 ? '+' : ''}${change.toFixed(1)} kg` : '–'}
        </span>
      </div>

      {/* Body Composition */}
      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-white/50">Body Composition</span>
          <div className="grid grid-cols-3 gap-x-4 gap-y-5">
            {composition.map(c => (
              <div key={c.label} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-[2px]">
                  <span className="text-[22px] font-bold leading-none" style={{ color: c.color }}>{c.value}</span>
                  {c.unit && <span className="text-[13px] font-semibold text-white/50">{c.unit}</span>}
                </div>
                <span className="text-[12px] text-white/40">{c.label}</span>
                {c.sub && <span className="text-[12px] font-medium" style={{ color: c.color }}>{c.sub}</span>}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Trend Chart */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-white/50">Weight Trend</span>
            <div className="flex gap-2">
              {([7, 14, 30] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-full text-[13px] font-semibold transition-all ${
                    period === p
                      ? 'bg-white text-black'
                      : 'bg-white/10 text-white/70 hover:bg-white/15'
                  }`}
                >
                  {p}d
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end justify-between gap-1 h-32">
            {chartWeights.map((v, i) => {
              const h = chartMax === chartMin ? 0.5 : (v - chartMin) / (chartMax - chartMin)
              const isLast = i === chartWeights.length - 1
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all hover:opacity-80 group relative"
                  style={{
                    height: `${h * 96 + 16}px`,
                    background: isLast ? '#2dd4bf' : 'rgba(255,255,255,0.2)',
                  }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-1 rounded text-[11px] text-white opacity-0 group-hover:opacity-100 whitespace-nowrap">
                    {v.toFixed(1)} kg
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-between text-[13px] text-white/50 pt-2">
            <span>Avg: {avg ? avg.toFixed(1) : '–'} kg</span>
            <span>Range: {min && max ? `${min.toFixed(1)}–${max.toFixed(1)} kg` : '–'}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export function ActivitySection({ rows, stepGoal = 10000 }: { rows: GezondheidsRow[]; stepGoal?: number }) {
  const stepRows = rows.filter(r => r.stappen != null).slice(0, 7).reverse()
  const steps = stepRows.map(r => Number(r.stappen))
  const todaySteps = steps[steps.length - 1] ?? 0
  const avgSteps = steps.length ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : 0
  const maxSteps = steps.length ? Math.max(...steps) : 10000

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text="–" />
      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-white/50">Today's Rings</span>
          <div className="flex justify-around">
            <RingChart progress={todaySteps / stepGoal} color="#f97316" label="Steps"    value={`${todaySteps ? todaySteps.toLocaleString('nl-NL') : '–'} / ${stepGoal >= 1000 ? `${stepGoal / 1000}K` : stepGoal}`} />
            <RingChart progress={0}                  color="#4ade80" label="Move"     value="– / – kcal" />
            <RingChart progress={0}                  color="#60a5fa" label="Stand"    value="– / – hrs" />
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Steps"      value={todaySteps ? todaySteps.toLocaleString('nl-NL') : '–'} detail="Today" Icon={Footprints} tint="text-orange-400" />
        <SmallCard title="Avg steps"  value={avgSteps ? avgSteps.toLocaleString('nl-NL') : '–'}   detail="7-day avg" Icon={Activity}   tint="text-blue-400"   />
        <SmallCard title="Active cal" value="–" unit="kcal" detail="–" Icon={Flame}  tint="text-red-400"    />
        <SmallCard title="Exercise"   value="–" unit="min"  detail="–" Icon={Timer}  tint="text-teal-400"   />
      </div>
      {steps.length > 1 && (
        <Card>
          <SectionHeader title="7-Day Steps" detail={`avg ${avgSteps.toLocaleString('nl-NL')}`} />
          <div className="flex items-end gap-1.5 h-16 mt-4">
            {steps.map((v, i) => (
              <div key={i} className="flex-1 rounded-sm"
                style={{ height: `${(v / maxSteps) * 56}px`, background: i === steps.length - 1 ? '#f97316' : 'rgba(255,255,255,0.15)' }} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
