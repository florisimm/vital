'use client'

import { useState } from 'react'
import { BedDouble, Activity, Heart, Scale, Footprints, Flame, Timer, Moon, Zap, ArrowUpRight } from 'lucide-react'
import { Card, SectionHeader, MetricTile } from '@/components/ui'

export type GezondheidsRow = { datum: string; stappen: number | null; gewicht: number | null }

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

export function SleepSection() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const heights = [0.6, 0.75, 0.55, 0.9, 0.7, 0.85, 0.95]
  return (
    <div className="flex flex-col gap-6">
      <AiInsight text="–" />
      <HeroMetric value="–" label="Sleep Score" note="–" Icon={BedDouble} tint="text-indigo-400" />
      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[15px] font-semibold text-white/50">Sleep Stages</span>
          <StageBar label="Deep"  duration="–" percent={0} tint="text-indigo-400" />
          <StageBar label="REM"   duration="–" percent={0} tint="text-purple-400" />
          <StageBar label="Light" duration="–" percent={0} tint="text-blue-400"   />
          <StageBar label="Awake" duration="–" percent={0} tint="text-white/40"   />
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Duration"    value="–" detail="–" Icon={Timer}    tint="text-blue-400"   />
        <SmallCard title="Bedtime"     value="–" detail="–" Icon={Moon}     tint="text-orange-400" />
        <SmallCard title="Wake"        value="–" detail="–" Icon={Activity} tint="text-yellow-400" />
        <SmallCard title="Consistency" value="–" detail="–" Icon={Zap}      tint="text-teal-400"   />
      </div>
      <Card>
        <SectionHeader title="7-Day Trend" detail="↑ 16m avg" />
        <div className="flex items-end gap-2 h-20 mt-4">
          {heights.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full rounded-[4px]" style={{ height: `${h * 64}px`, background: i === 6 ? '#818cf8' : 'rgba(255,255,255,0.15)' }} />
              <span className="text-[10px] text-white/40">{days[i]}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

export function RecoverySection() {
  const factors = [
    { label: 'HRV baseline',          status: '–',        ok: null  },
    { label: 'Resting heart rate',    status: '–',        ok: null  },
    { label: 'Sleep quality',         status: '–',        ok: null  },
    { label: 'Previous day strain',   status: '–',        ok: null  },
    { label: 'Temperature deviation', status: '–',        ok: null  },
  ]
  return (
    <div className="flex flex-col gap-6">
      <AiInsight text="–" />
      <HeroMetric value="–" label="Recovery Score" note="–" Icon={Heart} tint="text-teal-400" />
      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="HRV"          value="–" unit=""  detail="–" Icon={Activity} tint="text-green-400"  />
        <SmallCard title="Resting HR"   value="–" unit="" detail="–" Icon={Heart}    tint="text-pink-400"   />
        <SmallCard title="Sleep"        value="–"         detail="–" Icon={Moon}     tint="text-indigo-400" />
        <SmallCard title="Strain"       value="–"         detail="–" Icon={Flame}    tint="text-orange-400" />
      </div>
      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold text-white/50">Readiness Factors</span>
          {factors.map(f => (
            <div key={f.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={f.ok ? 'text-green-400' : 'text-yellow-400'}>{f.ok ? '✓' : '−'}</span>
                <span className="text-[15px] text-white">{f.label}</span>
              </div>
              <span className={`text-[14px] font-medium ${f.ok ? 'text-green-400' : 'text-yellow-400'}`}>{f.status}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ─── Heart ────────────────────────────────────────────────────────────────────

export function HeartSection() {
  const zones = [
    { label: 'Zone 5 · Max',              percent: 0.02, color: '#f87171' },
    { label: 'Zone 4 · Threshold',        percent: 0.08, color: '#fb923c' },
    { label: 'Zone 3 · Aerobic',          percent: 0.35, color: '#facc15' },
    { label: 'Zone 2 · Endurance',        percent: 0.42, color: '#4ade80' },
    { label: 'Zone 1 · Recovery',         percent: 0.13, color: '#60a5fa' },
  ]
  return (
    <div className="flex flex-col gap-6">
      <AiInsight text="–" />
      <div className="grid grid-cols-2 gap-3">
        <MetricTile title="Resting HR" value="–" unit="" note="–" Icon={Heart}    tint="text-pink-400"  />
        <MetricTile title="HRV"        value="–" unit=""  note="–"  Icon={Activity} tint="text-green-400" />
      </div>
      <Card>
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold text-white/50">Cardio Fitness</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-[42px] font-bold text-white leading-none">–</span>
            <span className="text-[17px] font-semibold text-white/50">VO₂ max</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[14px] font-medium text-teal-400">
              <ArrowUpRight size={14} /> –
            </span>
            <span className="text-[14px] text-white/40">–</span>
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold text-white/50">Heart Rate Zones</span>
          {zones.map(z => <ZoneBar key={z.label} label={z.label} percent={z.percent} color={z.color} />)}
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Blood Pressure" value="–" detail="–" Icon={Heart} tint="text-blue-400" />
        <SmallCard title="Max HR" value="–" unit="" detail="–" Icon={Zap}   tint="text-red-400"  />
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
