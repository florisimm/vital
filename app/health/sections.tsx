'use client'

import { Scale, Footprints, Activity, Timer } from 'lucide-react'
import { Card, SectionHeader } from '@/components/ui'

export type GezondheidsRow = { datum: string; stappen: number | null; gewicht: number | null }

// ─── Shared helpers ───────────────────────────────────────────────────────────

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
  return (
    <Card>
      <p className="text-white/40 text-[15px] text-center py-4">Geen slaapdata beschikbaar</p>
    </Card>
  )
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

export function RecoverySection() {
  return (
    <Card>
      <p className="text-white/40 text-[15px] text-center py-4">Geen hersteldata beschikbaar</p>
    </Card>
  )
}

// ─── Heart ────────────────────────────────────────────────────────────────────

export function HeartSection() {
  return (
    <Card>
      <p className="text-white/40 text-[15px] text-center py-4">Geen hartdata beschikbaar</p>
    </Card>
  )
}

// ─── Weight ───────────────────────────────────────────────────────────────────

export function WeightSection({ rows }: { rows: GezondheidsRow[] }) {
  const weightRows = rows.filter(r => r.gewicht != null).slice(0, 14).reverse()
  const weights = weightRows.map(r => Number(r.gewicht))
  const latest = weights[weights.length - 1]
  const avg = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0
  const min = weights.length ? Math.min(...weights) : 0
  const max = weights.length ? Math.max(...weights) : 0
  const range = max - min

  const displayWeight = latest ?? null

  // Pad weights array to 14 entries for the chart
  const chartWeights = weights.length >= 14 ? weights : [
    ...Array(14 - weights.length).fill(avg || 0),
    ...weights,
  ]
  const chartMin = Math.min(...chartWeights)
  const chartMax = Math.max(...chartWeights)

  if (!displayWeight) {
    return (
      <Card>
        <p className="text-white/40 text-[15px] text-center py-4">Geen gewichtsdata beschikbaar</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="flex flex-col gap-2">
        <Scale size={22} className="text-cyan-400" />
        <div className="flex items-baseline gap-1">
          <span className="text-[56px] font-bold text-white leading-none">{displayWeight.toFixed(1)}</span>
          <span className="text-[24px] font-semibold text-white/50 ml-1">kg</span>
        </div>
        {range > 0 && (
          <span className="text-[15px] font-medium text-cyan-400">±{range.toFixed(1)} kg over 14 days</span>
        )}
      </div>

      {/* 14-Day Trend */}
      {weights.length > 1 && (
        <Card>
          <SectionHeader title="14-Day Trend" detail={range > 0 ? `±${range.toFixed(1)} kg` : 'Stabiel'} />
          <div className="flex items-end gap-[5px] h-16 mt-4">
            {chartWeights.map((v, i) => {
              const h = chartMax === chartMin ? 0.5 : (v - chartMin) / (chartMax - chartMin)
              const isLast = i === chartWeights.length - 1
              return (
                <div key={i} className="flex-1 rounded-[3px]"
                  style={{
                    height: `${h * 48 + 12}px`,
                    background: isLast ? '#22d3ee' : 'rgba(255,255,255,0.15)',
                  }} />
              )
            })}
          </div>
          <div className="flex justify-between mt-3">
            <span className="text-[12px] text-white/40">Avg: {avg.toFixed(1)} kg</span>
            <span className="text-[12px] text-white/40">Range: {min.toFixed(1)}–{max.toFixed(1)} kg</span>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export function ActivitySection({ rows }: { rows: GezondheidsRow[] }) {
  const stepRows = rows.filter(r => r.stappen != null).slice(0, 7).reverse()
  const steps = stepRows.map(r => Number(r.stappen))
  const todaySteps = steps[steps.length - 1] ?? 0
  const avgSteps = steps.length ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : 0
  const maxSteps = steps.length ? Math.max(...steps) : 10000

  if (steps.length === 0) {
    return (
      <Card>
        <p className="text-white/40 text-[15px] text-center py-4">Geen activiteitsdata beschikbaar</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {todaySteps > 0 && (
        <Card>
          <div className="flex flex-col gap-4">
            <span className="text-[15px] font-semibold text-white/50">Stappen vandaag</span>
            <div className="flex justify-center">
              <RingChart progress={todaySteps / 10000} color="#f97316" label="Steps" value={`${todaySteps.toLocaleString('nl-NL')} / 10K`} />
            </div>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="Stappen" value={todaySteps.toLocaleString('nl-NL')} detail="Vandaag" Icon={Footprints} tint="text-orange-400" />
        {avgSteps > 0 && <SmallCard title="Gem. stappen" value={avgSteps.toLocaleString('nl-NL')} detail="7-daags gem." Icon={Activity} tint="text-blue-400" />}
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
