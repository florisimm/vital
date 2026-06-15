'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { BedDouble, Activity, Heart, Scale, Footprints, Flame, Timer, Moon, Zap, ArrowUpRight } from 'lucide-react'
import { Card, SectionHeader, MetricTile } from '@/components/ui'
import { healthFetcher } from './fetcher'
import { fetchWeeklyNutrition } from '@/app/food/fetchers'
import { computePhysiologyReadiness, computeHRVBaseline, computeIllnessFlag } from '@/lib/readiness'
import { localDateStr } from '@/lib/timeFormat'

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
  wakker_minuten: number | null
  wakker_count: number | null
  spo2: number | null
  ademhalingsfrequentie: number | null
  slaap_start_min: number | null
  slaap_einde_min: number | null
}

const SWR_OPTS = { revalidateOnFocus: false, dedupingInterval: 60_000 }

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmtMin(min: number | null) {
  if (!min) return '–'
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtTime(min: number | null) {
  if (min === null) return '–'
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  const fmt = typeof window !== 'undefined' ? (localStorage.getItem('time_format') ?? '24h') : '24h'
  if (fmt === '12h') {
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${m.toString().padStart(2, '0')} ${period}`
  }
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function avg(vals: (number | null)[]): number | null {
  const clean = vals.filter((v): v is number => v !== null)
  return clean.length ? Math.round(clean.reduce((a, b) => a + b, 0) / clean.length) : null
}

// Average for sleep times that cross midnight. Values < 8h (480 min) are
// treated as next-day (e.g. 00:15 → 24h15m = 1455 min) before averaging.
function avgSleepTime(vals: (number | null)[]): number | null {
  const clean = vals.filter((v): v is number => v !== null)
  if (!clean.length) return null
  const normalized = clean.map(v => v < 480 ? v + 1440 : v)
  const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length
  return Math.round(mean % 1440)
}

// Large metric card with vs-30d comparison
function HeroCard({ label, value, diff, formatDiff, tint }: {
  label: string; value: string; diff: number | null
  formatDiff: (d: number) => string; tint: string
}) {
  const diffColor = diff === null ? '' : diff > 0 ? '#4ade80' : diff < 0 ? '#f87171' : 'rgba(255,255,255,0.3)'
  return (
    <div className="rounded-[16px] p-4 flex flex-col gap-2" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-white/40">{label}</span>
      <span className="text-[34px] font-bold leading-none" style={{ color: tint }}>{value}</span>
      {diff !== null ? (
        <span className="text-[12px] font-semibold" style={{ color: diffColor }}>
          {diff > 0 ? '+' : ''}{formatDiff(diff)} vs 30d avg
        </span>
      ) : (
        <span className="text-[12px] text-white/20">–</span>
      )}
    </div>
  )
}

// 30-day bar trend chart
function TrendChart({ label, values, color, avg7, avg30, format }: {
  label: string; values: (number | null)[]; color: string
  avg7: number | null; avg30: number | null; format: (v: number) => string
}) {
  const nonNull = values.filter((v): v is number => v !== null)
  const maxV = nonNull.length ? Math.max(...nonNull) : 1
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-white/50">{label}</span>
        <div className="flex gap-3">
          {avg7  !== null && <span className="text-[11px] text-white/40">7d <span className="text-white/65 font-medium">{format(avg7)}</span></span>}
          {avg30 !== null && <span className="text-[11px] text-white/40">30d <span className="text-white/65 font-medium">{format(avg30)}</span></span>}
        </div>
      </div>
      <div className="flex items-end gap-[2px] h-14">
        {values.map((v, i) => {
          const h = v ? Math.max((v / maxV) * 48, 4) : 3
          const isLast = i === values.length - 1
          return (
            <div key={i} className="flex-1 rounded-sm transition-all" style={{
              height: `${h}px`,
              background: isLast ? color : v ? `${color}55` : 'rgba(255,255,255,0.05)',
            }} />
          )
        })}
      </div>
    </div>
  )
}

// Compact secondary metric tile
function MiniCard({ title, value, tint }: { title: string; value: string; tint: string }) {
  return (
    <div className="rounded-[12px] px-3 py-2.5 flex flex-col gap-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <span className="text-[10px] text-white/30 uppercase tracking-[0.08em]">{title}</span>
      <span className={`text-[15px] font-semibold ${tint}`}>{value}</span>
    </div>
  )
}

function AiInsight({ text }: { text: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-orange-400 text-[14px]">✦</span>
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">Coach Tip</span>
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

function StageBar({ label, duration, percent, pct, tint }: { label: string; duration: string; percent: number; pct?: number | null; tint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium text-white">{label}</span>
        <span className={`text-[14px] font-semibold ${tint}`}>
          {duration}{pct != null ? ` · ${pct}%` : ''}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className={`h-full rounded-full ${tint.replace('text-', 'bg-')} opacity-80`} style={{ width: `${percent * 100}%` }} />
      </div>
    </div>
  )
}

function StageLegend({ label, color, duration, pct }: { label: string; color: string; duration: string; pct: number | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[14px] font-medium text-white">{label}</span>
      <span className="ml-auto text-[14px] font-semibold text-white/80">{duration}</span>
      <span className="text-[13px] text-white/40 w-9 text-right">{pct != null ? `${pct}%` : '–'}</span>
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

// Composite sleep score (0–100) calibrated to approximate Fitbit's score.
// Fitbit's real score also uses sleeping heart rate (which the Google Health API
// does not expose), so this is an approximation from the data we do have:
// duration (convex penalty for short sleep), deep+REM composition (55% target),
// efficiency (rescaled 75–100%), and restlessness (number of awakenings).
export function computeSleepScore(r: GezondheidsRow): number | null {
  const asleep = r.slaap_minuten
  if (!asleep) return null
  const awake = r.wakker_minuten ?? 0
  const deep  = r.slaap_diep ?? 0
  const rem   = r.slaap_rem ?? 0
  const duration    = Math.min(asleep / 480, 1) ** 2                       // 8h target, convex
  const composition = Math.min((deep + rem) / asleep / 0.55, 1)            // 55% deep+REM target
  const efficiency  = Math.max(0, Math.min((asleep / (asleep + awake) - 0.75) / 0.25, 1)) // 75→100%

  const parts: [number, number][] = [[duration, 0.5], [composition, 0.35], [efficiency, 0.15]]
  if (r.wakker_count != null) {
    // Restlessness: fewer awakenings = better (1 awakening → 1.0, 13+ → 0.0)
    const restlessness = Math.max(0, Math.min(1 - (r.wakker_count - 1) / 12, 1))
    parts[0][1] = 0.45; parts[1][1] = 0.30; parts[2][1] = 0.10
    parts.push([restlessness, 0.15])
  }
  const totalWeight = parts.reduce((s, [, w]) => s + w, 0)
  const weighted = parts.reduce((s, [v, w]) => s + v * w, 0)
  return Math.round((weighted / totalWeight) * 100)
}

// Sleep is stored under the wake-up date, so "last night" = today's datum.
function nightLabel(datum: string): string {
  if (datum === localDateStr()) return 'Last night'
  const d = new Date(datum + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function SleepSection() {
  const { data: rows = [] } = useSWR<GezondheidsRow[]>('health-gezondheid', healthFetcher, SWR_OPTS)

  const sleepRows = rows.filter(r => r.slaap_minuten != null)
  const nights = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i)
    const datum = localDateStr(d)
    return { datum, row: rows.find(r => r.datum === datum) ?? null }
  })
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const idx = selectedIdx !== null
    ? Math.min(selectedIdx, nights.length - 1)
    : Math.max(0, nights.findIndex(n => n.row?.slaap_minuten != null))
  const selectedRow = nights[idx]?.row ?? null

  const totalMin    = selectedRow?.slaap_minuten ?? null
  const score       = selectedRow ? computeSleepScore(selectedRow) : null
  const deep        = selectedRow?.slaap_diep ?? null
  const light       = selectedRow?.slaap_licht ?? null
  const rem         = selectedRow?.slaap_rem ?? null
  const wake        = selectedRow?.wakker_minuten ?? null
  const spo2        = selectedRow?.spo2 ?? null
  const resp        = selectedRow?.ademhalingsfrequentie ?? null
  const bedtimeMin  = selectedRow?.slaap_start_min ?? null
  const wakeTimeMin = selectedRow?.slaap_einde_min ?? null

  const last30 = sleepRows.slice(0, 30)
  const last7  = sleepRows.slice(0, 7)

  const avg30Score    = avg(last30.map(computeSleepScore))
  const avg30Min      = avg(last30.map(r => r.slaap_minuten))
  const avg7Score     = avg(last7.map(computeSleepScore))
  const avg7Min       = avg(last7.map(r => r.slaap_minuten))
  const avg7Bedtime   = avgSleepTime(last7.map(r => r.slaap_start_min))
  const avg7WakeTime  = avgSleepTime(last7.map(r => r.slaap_einde_min))

  // When selected night has no data, fill cards with 7-day averages
  const usingAvg     = !selectedRow?.slaap_minuten && avg7Score !== null
  const dispScore    = score    ?? (usingAvg ? avg7Score    : null)
  const dispTotalMin = totalMin ?? (usingAvg ? avg7Min      : null)
  const dispBedtime  = bedtimeMin  ?? (usingAvg ? avg7Bedtime  : null)
  const dispWakeTime = wakeTimeMin ?? (usingAvg ? avg7WakeTime : null)

  const scoreDiff    = !usingAvg && score !== null && avg30Score !== null ? score - avg30Score : null
  const durationDiff = !usingAvg && totalMin !== null && avg30Min !== null ? totalMin - avg30Min : null

  const asleepTotal  = (totalMin ?? ((deep ?? 0) + (rem ?? 0) + (light ?? 0))) || 1
  const stagesTotal  = (asleepTotal + (wake ?? 0)) || 1

  const efficiency = asleepTotal > 0 && stagesTotal > 0
    ? Math.round((asleepTotal / stagesTotal) * 100) : null

  // Stage percentages relative to time asleep (deep+rem+light ≈ 100%), like Fitbit
  const deepPct  = deep  && asleepTotal ? Math.round(deep  / asleepTotal * 100) : null
  const remPct   = rem   && asleepTotal ? Math.round(rem   / asleepTotal * 100) : null
  const lightPct = light && asleepTotal ? Math.round(light / asleepTotal * 100) : null
  const wakePct  = wake  && stagesTotal ? Math.round(wake  / stagesTotal * 100) : null

  // Stacked-bar segment widths relative to total time in bed (sum to 100%)
  const stageSegments = [
    { label: 'Deep',  min: deep  ?? 0, color: '#818cf8' },
    { label: 'REM',   min: rem   ?? 0, color: '#c084fc' },
    { label: 'Light', min: light ?? 0, color: '#60a5fa' },
    { label: 'Awake', min: wake  ?? 0, color: 'rgba(255,255,255,0.30)' },
  ]

  // Consistency: lower stddev of wake times = more consistent; score 0–100%
  const wakeTimes = last7.map(r => r.slaap_einde_min).filter((v): v is number => v !== null)
  let consistency: number | null = null
  if (wakeTimes.length >= 3) {
    const mean = wakeTimes.reduce((a, b) => a + b, 0) / wakeTimes.length
    const stddev = Math.sqrt(wakeTimes.reduce((a, b) => a + (b - mean) ** 2, 0) / wakeTimes.length)
    consistency = Math.round(Math.max(0, Math.min(100, 100 - (stddev / 90) * 100)))
  }

  // Trend arrays oldest→newest
  const scoreValues    = [...last30].reverse().map(computeSleepScore)
  const durationValues = [...last30].reverse().map(r => r.slaap_minuten)

  // AI quality
  const quality = score === null ? null
    : score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : 'Poor'
  const qualityColor = quality === 'Excellent' ? '#4ade80'
    : quality === 'Good' ? '#34d399' : quality === 'Fair' ? '#fbbf24' : '#f87171'

  const noData = !totalMin

  const insightText = noData
    ? (selectedRow === null ? 'No Fitbit data for this night — Fitbit was not worn.' : 'Sync Fitbit to see your sleep quality data.')
    : (() => {
        const lines: string[] = []
        if (deepPct !== null && deepPct < 20) {
          const streak = sleepRows.slice(0, 4).filter(r => {
            const d = r.slaap_diep; const t = r.slaap_minuten
            return d !== null && t !== null && Math.round(d / t * 100) < 20
          }).length
          lines.push(streak >= 3
            ? `Deep sleep below 20% for ${streak} consecutive nights — try an earlier bedtime and less screen time in the evening.`
            : `Deep sleep at ${deepPct}% — slightly below the 20–25% target.`)
        } else if (deepPct !== null) {
          lines.push(`Deep sleep at ${deepPct}% — within the healthy range.`)
        }
        if (efficiency !== null && efficiency < 85)
          lines.push(`Sleep efficiency at ${efficiency}% — frequent awakenings are reducing sleep quality.`)
        if (totalMin !== null && avg30Min !== null) {
          const diff = totalMin - avg30Min
          if (Math.abs(diff) > 30)
            lines.push(`Duration ${diff > 0 ? '+' : ''}${fmtMin(Math.round(diff))} vs your 30-day average.`)
        }
        return lines.join(' ') || 'Sleep data looks normal.'
      })()

  // Sleep → next-day HRV correlation pairs
  const correlationPairs: { sleep: number; hrv: number }[] = []
  for (const r of sleepRows.slice(0, 14)) {
    const s = computeSleepScore(r)
    if (!s) continue
    const next = new Date(r.datum + 'T00:00:00')
    next.setDate(next.getDate() + 1)
    const nextRow = rows.find(x => x.datum === next.toISOString().slice(0, 10))
    if (nextRow?.hrv_rmssd != null) correlationPairs.push({ sleep: s, hrv: nextRow.hrv_rmssd })
  }
  correlationPairs.reverse()
  const corrMaxSleep = Math.max(...correlationPairs.map(p => p.sleep), 1)
  const corrMaxHRV   = Math.max(...correlationPairs.map(p => p.hrv), 1)

  return (
    <div className="flex flex-col gap-5">

      {/* Night selector — tap to view other nights */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {nights.map((night, i) => {
          const s = night.row ? computeSleepScore(night.row) : null
          const active = i === idx
          return (
            <button
              key={night.datum}
              onClick={() => setSelectedIdx(i)}
              className="shrink-0 rounded-[14px] px-3.5 py-2 flex flex-col items-start gap-0.5 transition-all"
              style={{
                background: active ? 'rgba(129,140,248,0.18)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${active ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: active ? '#a5b4fc' : 'rgba(255,255,255,0.5)' }}>
                {nightLabel(night.datum)}
              </span>
              <span className="text-[15px] font-bold" style={{ color: s === null ? 'rgba(255,255,255,0.2)' : 'white' }}>
                {s ?? '–'}
              </span>
            </button>
          )
        })}
      </div>

      {/* Average warning */}
      {usingAvg && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-[12px]" style={{ background: 'rgba(251,146,60,0.10)', border: '1px solid rgba(251,146,60,0.25)' }}>
          <span className="text-orange-400 text-[13px]">⚑</span>
          <span className="text-[12px] font-medium text-orange-300">Geen Fitbit-data — onderstaande waarden zijn je 7-daags gemiddelde</span>
        </div>
      )}

      {/* Hero 4 metrics */}
      <div className="grid grid-cols-2 gap-3">
        <HeroCard
          label="Sleep Score"
          value={dispScore !== null ? String(dispScore) : '–'}
          diff={scoreDiff}
          formatDiff={d => `${Math.abs(Math.round(d))} pts`}
          tint="#818cf8"
        />
        <HeroCard
          label="Duration"
          value={dispTotalMin ? `${Math.floor(dispTotalMin / 60)}h ${dispTotalMin % 60}m` : '–'}
          diff={durationDiff}
          formatDiff={d => fmtMin(Math.round(Math.abs(d)))}
          tint="#60a5fa"
        />
        <HeroCard
          label="Bedtime"
          value={fmtTime(dispBedtime)}
          diff={null}
          formatDiff={() => ''}
          tint="rgba(255,255,255,0.75)"
        />
        <HeroCard
          label="Wake time"
          value={fmtTime(dispWakeTime)}
          diff={null}
          formatDiff={() => ''}
          tint="rgba(255,255,255,0.75)"
        />
      </div>

      {/* AI Insight */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-orange-400 text-[14px]">✦</span>
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">Coach Tip</span>
            {quality && (
              <span className="ml-auto text-[12px] font-bold" style={{ color: qualityColor }}>
                Sleep Quality: {quality}
              </span>
            )}
          </div>
          <p className="text-[15px] text-white/75 leading-relaxed">{insightText}</p>
        </div>
      </Card>

      {/* Sleep Stages */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-white/50">Sleep Stages</span>
            <span className="text-[13px] font-medium text-white/35">{fmtMin(totalMin)} asleep</span>
          </div>

          {/* Stacked composition bar (segments sum to total time in bed) */}
          <div className="flex h-3.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            {stageSegments.filter(s => s.min > 0).map(s => (
              <div key={s.label} className="h-full" title={`${s.label} ${fmtMin(s.min)}`}
                style={{ width: `${(s.min / stagesTotal) * 100}%`, flexShrink: 0, background: s.color }} />
            ))}
          </div>

          {/* Legend rows */}
          <div className="flex flex-col gap-2.5 pt-1">
            <StageLegend label="Deep"  color="#818cf8"                 duration={fmtMin(deep)}  pct={deepPct}  />
            <StageLegend label="REM"   color="#c084fc"                 duration={fmtMin(rem)}   pct={remPct}   />
            <StageLegend label="Light" color="#60a5fa"                 duration={fmtMin(light)} pct={lightPct} />
            <StageLegend label={selectedRow?.wakker_count != null ? `Awake · woke ${selectedRow.wakker_count}×` : 'Awake'} color="rgba(255,255,255,0.30)"  duration={fmtMin(wake)}  pct={wakePct}  />
          </div>
        </div>
      </Card>

      {/* Quality Insights 3×2 — SpO₂ promoted to primary grid */}
      <div className="grid grid-cols-3 gap-2">
        <MiniCard title="Deep"        value={deepPct  !== null ? `${deepPct}%`  : '–'} tint={deepPct  !== null && deepPct  >= 20 ? 'text-indigo-400' : 'text-yellow-400'} />
        <MiniCard title="REM"         value={remPct   !== null ? `${remPct}%`   : '–'} tint={remPct   !== null && remPct   >= 20 ? 'text-purple-400' : 'text-yellow-400'} />
        <MiniCard title="SpO₂"        value={spo2     !== null ? `${spo2}%`     : '–'} tint={spo2     !== null && spo2     >= 95 ? 'text-teal-400'   : 'text-red-400'}    />
        <MiniCard title="Efficiency"  value={efficiency  !== null ? `${efficiency}%`  : '–'} tint={efficiency  !== null && efficiency  >= 85 ? 'text-green-400' : 'text-yellow-400'} />
        <MiniCard title="Consistency" value={consistency !== null ? `${consistency}%` : '–'} tint={consistency !== null && consistency >= 80 ? 'text-teal-400'  : 'text-yellow-400'} />
        <MiniCard title="Resp"        value={resp !== null ? `${resp}/min` : '–'}       tint="text-cyan-400" />
      </div>

      {/* 30-day trends */}
      {last30.length > 2 && (
        <Card>
          <div className="flex flex-col gap-6">
            <TrendChart
              label="Sleep Score"
              values={scoreValues}
              color="#818cf8"
              avg7={avg7Score}
              avg30={avg30Score}
              format={v => String(v)}
            />
            <TrendChart
              label="Sleep Duration"
              values={durationValues}
              color="#60a5fa"
              avg7={avg7Min}
              avg30={avg30Min}
              format={v => fmtMin(v)}
            />
          </div>
        </Card>
      )}

      {correlationPairs.length >= 4 && (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-white/50">Sleep → Next-Day HRV</span>
              <span className="text-[11px] text-white/30">{correlationPairs.length} nights</span>
            </div>
            <div>
              <span className="text-[11px] text-indigo-400 font-medium">Sleep score</span>
              <div className="flex items-end gap-[2px] h-10 mt-1.5">
                {correlationPairs.map((p, i) => (
                  <div key={i} className="flex-1 rounded-sm"
                    style={{ height: `${Math.max((p.sleep / corrMaxSleep) * 40, 4)}px`, background: i === correlationPairs.length - 1 ? '#818cf8' : '#818cf855' }} />
                ))}
              </div>
            </div>
            <div>
              <span className="text-[11px] text-green-400 font-medium">Next-day HRV (ms)</span>
              <div className="flex items-end gap-[2px] h-10 mt-1.5">
                {correlationPairs.map((p, i) => (
                  <div key={i} className="flex-1 rounded-sm"
                    style={{ height: `${Math.max((p.hrv / corrMaxHRV) * 40, 4)}px`, background: i === correlationPairs.length - 1 ? '#4ade80' : '#4ade8055' }} />
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}


    </div>
  )
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

export function RecoverySection() {
  const { data: rows = [] } = useSWR<GezondheidsRow[]>('health-gezondheid', healthFetcher, SWR_OPTS)

  const todayRow        = rows.find(r => r.datum === localDateStr()) ?? null
  const latestWithSleep = todayRow?.slaap_minuten != null ? todayRow : null
  const latestWithHR    = todayRow?.hartslag_rust != null ? todayRow : null
  const latestWithHRV   = todayRow?.hrv_rmssd     != null ? todayRow : null

  const hrv        = latestWithHRV?.hrv_rmssd ?? null
  const restingHR  = latestWithHR?.hartslag_rust ?? null
  const sleepScore = latestWithSleep ? computeSleepScore(latestWithSleep) : null
  const sleepMin   = latestWithSleep?.slaap_minuten ?? null

  const readiness   = computePhysiologyReadiness(rows)
  const illnessFlag = computeIllnessFlag(rows)

  const hrvBaseline = computeHRVBaseline(rows)
  const hrvThreshold = hrvBaseline.baseline ? hrvBaseline.baseline * 0.85 : 35
  const hrThreshold  = (() => {
    const hrVals = rows.filter(r => r.hartslag_rust != null).slice(0, 14).map(r => r.hartslag_rust as number)
    return hrVals.length >= 5 ? Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length) + 5 : 65
  })()

  const hrvOk   = hrv       ? hrv >= hrvThreshold   : null
  const hrOk    = restingHR ? restingHR <= hrThreshold : null
  const sleepOk = sleepMin  ? sleepMin >= 420         : null

  const factors = [
    { label: 'HRV',        status: hrv       ? `${Math.round(hrv)} ms` : '–', ok: hrvOk, note: hrvBaseline.baseline ? `baseline ${hrvBaseline.baseline} ms` : '' },
    { label: 'Resting HR', status: restingHR ? `${restingHR} bpm`      : '–', ok: hrOk,  note: `threshold ${hrThreshold} bpm` },
    { label: 'Sleep',      status: sleepMin  ? fmtMin(sleepMin)        : '–', ok: sleepOk, note: '7h target' },
  ]

  const todayFocus = (() => {
    if (illnessFlag) return { emoji: '🛑', title: 'Skip training today', sub: illnessFlag.reason }
    if (!readiness.score) return { emoji: '📊', title: 'Connect Fitbit', sub: 'Sync health data to see personalised focus advice' }
    if (readiness.score >= 80) return { emoji: '💪', title: 'Push hard today', sub: readiness.explanation || 'Recovery is peak — ideal day for intense training' }
    if (readiness.score >= 65) return { emoji: '🏃', title: 'Train at moderate intensity', sub: readiness.explanation || 'Good recovery — keep efforts below max today' }
    if (readiness.score >= 50) return { emoji: '🚶', title: 'Keep it light', sub: readiness.explanation || 'Below-normal recovery — easy movement only' }
    return { emoji: '😴', title: 'Rest & recover', sub: readiness.explanation || 'Low readiness — prioritise sleep and nutrition today' }
  })()

  return (
    <div className="flex flex-col gap-6">
      {illnessFlag && (
        <div className="px-4 py-3 rounded-2xl border border-orange-400/30" style={{ background: 'rgba(251,146,60,0.10)' }}>
          <div className="flex items-start gap-2.5">
            <span className="text-orange-400 text-[16px] shrink-0">⚠</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-orange-300">Signs of strain detected</span>
              <span className="text-[12px] text-white/60">{illnessFlag.reason} — consider rest today</span>
            </div>
          </div>
        </div>
      )}
      <div className="p-5 rounded-[22px] border border-white/[0.1]" style={{ background: 'rgba(45,212,191,0.07)' }}>
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em] mb-3">Today's Focus</p>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[32px] leading-none">{todayFocus.emoji}</span>
          <p className="text-[19px] font-bold text-white leading-tight">{todayFocus.title}</p>
        </div>
        {todayFocus.sub && <p className="text-[13px] text-white/55 leading-relaxed mb-3">{todayFocus.sub}</p>}
        <div className="flex flex-col gap-1.5 pt-3 border-t border-white/[0.08]">
          {factors.map(f => (
            <div key={f.label} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.ok === true ? 'bg-teal-400' : f.ok === false ? 'bg-orange-400' : 'bg-white/20'}`} />
              <span className="text-[13px] text-white/60">{f.label}: <span className="text-white/80">{f.status}</span>{f.note ? <span className="text-white/35"> · {f.note}</span> : ''}</span>
            </div>
          ))}
        </div>
      </div>
      <HeroMetric
        value={readiness.score ? String(readiness.score) : '–'}
        label="Readiness"
        note={readiness.score ? readiness.label : '–'}
        Icon={Heart}
        tint="text-teal-400"
      />
      <div className="grid grid-cols-2 gap-3">
        <SmallCard title="HRV"        value={hrv ? Math.round(hrv).toString() : '–'}  unit={hrv ? 'ms' : ''}        detail={hrvBaseline.baseline ? `baseline ${hrvBaseline.baseline} ms` : 'Daily RMSSD'} Icon={Activity} tint="text-green-400" />
        <SmallCard title="Resting HR" value={restingHR ? String(restingHR) : '–'}     unit={restingHR ? 'bpm' : ''} detail="Last night"  Icon={Heart} tint="text-pink-400" />
      </div>

      {/* 7-day HRV trend — proxy for recovery trajectory */}
      {(() => {
        const hrv7 = [...rows.filter(r => r.hrv_rmssd != null)].reverse().slice(-7)
        if (hrv7.length < 3) return null
        const maxV = Math.max(...hrv7.map(r => r.hrv_rmssd as number), 1)
        return (
          <Card>
            <div className="flex flex-col gap-3">
              <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">7-Day HRV Trend</span>
              <div className="flex items-end gap-[3px] h-12">
                {hrv7.map((r, i) => {
                  const v = r.hrv_rmssd as number
                  const isLast = i === hrv7.length - 1
                  return (
                    <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max((v / maxV) * 48, 4)}px`, background: isLast ? '#4ade80' : '#4ade8055' }} />
                  )
                })}
              </div>
              {(() => {
                const first = hrv7[0].hrv_rmssd as number
                const last = hrv7[hrv7.length - 1].hrv_rmssd as number
                const diff = Math.round(last - first)
                return (
                  <span className="text-[12px]" style={{ color: diff > 0 ? '#4ade80' : diff < 0 ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
                    {diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} {Math.abs(diff)} ms over 7 days
                  </span>
                )
              })()}
            </div>
          </Card>
        )
      })()}

      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Readiness Factors</span>
          {factors.map(f => (
            <div key={f.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={f.ok === null ? 'text-white/30' : f.ok ? 'text-green-400' : 'text-yellow-400'}>
                  {f.ok === null ? '○' : f.ok ? '✓' : '−'}
                </span>
                <div className="flex flex-col">
                  <span className="text-[15px] text-white">{f.label}</span>
                  {f.note && <span className="text-[11px] text-white/30">{f.note}</span>}
                </div>
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

function buildHeartInsight(restingHR: number | null, hrv: number | null, trend: number | null, hrvBaseline: { baseline: number | null; deviationPct: number | null }): string {
  if (!restingHR && !hrv) return 'Sync Fitbit to see your heart rate and HRV data.'
  const parts: string[] = []
  if (hrvBaseline.deviationPct !== null) {
    if (hrvBaseline.deviationPct <= -15) parts.push(`HRV is ${Math.abs(hrvBaseline.deviationPct)}% below your baseline — your body is still recovering. Keep today easy.`)
    else if (hrvBaseline.deviationPct >= 15) parts.push(`HRV is ${hrvBaseline.deviationPct}% above baseline — recovery looks strong.`)
  }
  if (trend !== null) {
    if (trend >= 4) parts.push(`Resting HR is ${trend} bpm above your 7-day average — consider an extra rest day or earlier sleep.`)
    else if (trend <= -4) parts.push(`Resting HR trending down — a sign of improving cardiovascular fitness.`)
  }
  if (parts.length === 0 && restingHR) parts.push(`Resting HR at ${restingHR} bpm${hrv ? ` · HRV ${Math.round(hrv)} ms` : ''} — within normal range.`)
  return parts[0]
}

function buildWeightInsight(weights: number[], weeklyRate: number | null, change: number, avgProtein: number, proteinTarget: number): string {
  if (weights.length < 2) return weights.length === 0
    ? 'Log your weight regularly to track trends over time.'
    : 'Add more weigh-ins to see your trend.'

  const latest = weights[weights.length - 1]
  const protLow = proteinTarget > 0 && avgProtein > 0 && avgProtein < proteinTarget * 0.75

  const prediction = weeklyRate !== null && Math.abs(weeklyRate) >= 0.05 && latest
    ? (() => {
        const in4w = latest + weeklyRate * 4
        return ` At this rate, you'll be around ${in4w.toFixed(1)} kg in 4 weeks.`
      })()
    : ''

  if (weeklyRate !== null) {
    if (weeklyRate < -1.0) {
      const protNote = protLow ? ` Average protein (${avgProtein}g/day) is below your ${proteinTarget}g target — prioritise protein to preserve muscle.` : ''
      return `Losing ${Math.abs(weeklyRate).toFixed(2)} kg/week — that's fast.${prediction}${protNote}`
    }
    if (weeklyRate < -0.05) {
      const protNote = protLow ? ` Average protein (${avgProtein}g/day) is below your ${proteinTarget}g target.` : ''
      return `Losing about ${Math.abs(weeklyRate).toFixed(2)} kg/week — steady progress.${prediction}${protNote}`
    }
    if (weeklyRate > 0.6) return `Gaining ${weeklyRate.toFixed(2)} kg/week.${prediction}`
    return `Weight is stable.${protLow ? ` Average protein (${avgProtein}g/day) is below your ${proteinTarget}g target.` : ''}`
  }
  return change > 0
    ? `Up ${change.toFixed(1)} kg over this period.`
    : `Down ${Math.abs(change).toFixed(1)} kg over this period — keep it up.`
}

export function HeartSection() {
  const { data: rows = [] } = useSWR<GezondheidsRow[]>('health-gezondheid', healthFetcher, SWR_OPTS)

  const hrRows = rows.filter(r => r.hartslag_rust != null).slice(0, 7)
  const latest = hrRows[0]
  const restingHR = latest?.hartslag_rust ?? null
  const hrv = rows.find(r => r.hrv_rmssd != null)?.hrv_rmssd ?? null

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

  const hrvBaseline = computeHRVBaseline(rows)
  const [hrvPeriod, setHrvPeriod] = useState<7 | 30>(30)
  const hrvAll = [...rows.filter(r => r.hrv_rmssd != null)].reverse()
  const hrv30 = hrvAll.slice(-hrvPeriod)
  const maxHRV = hrv30.length ? Math.max(...hrv30.map(r => r.hrv_rmssd as number), 1) : 1
  const baselineH = hrv30.length && hrvBaseline.baseline ? (hrvBaseline.baseline / maxHRV) * 48 : null

  const deviationText = hrvBaseline.deviationPct !== null
    ? `${hrvBaseline.deviationPct > 0 ? '+' : ''}${hrvBaseline.deviationPct}% vs baseline`
    : 'Daily RMSSD'

  return (
    <div className="flex flex-col gap-6">
      <AiInsight text={buildHeartInsight(restingHR, hrv, trend, hrvBaseline)} />
      <div className="grid grid-cols-2 gap-3">
        <MetricTile title="Resting HR" value={restingHR ? String(restingHR) : '–'} unit={restingHR ? 'bpm' : ''} note={trend !== null ? `${trend > 0 ? '+' : ''}${trend} vs avg` : '–'} Icon={Heart}    tint="text-pink-400"  />
        <MetricTile title="HRV"        value={hrv ? Math.round(hrv).toString() : '–'} unit={hrv ? 'ms' : ''} note={deviationText} Icon={Activity} tint="text-green-400" />
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
      {hrv30.length > 4 && (
        <Card>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-white/50">HRV Trend</span>
                <div className="flex gap-1">
                  {([7, 30] as const).map(p => (
                    <button key={p} onClick={() => setHrvPeriod(p)}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full transition-all"
                      style={{ background: hrvPeriod === p ? 'rgba(255,255,255,0.15)' : 'transparent', color: hrvPeriod === p ? 'white' : 'rgba(255,255,255,0.35)' }}>
                      {p}d
                    </button>
                  ))}
                </div>
              </div>
              {hrvBaseline.baseline !== null && (
                <div className="flex gap-3">
                  <span className="text-[11px] text-white/40">baseline <span className="text-white/65 font-medium">{hrvBaseline.baseline} ms</span></span>
                  {hrvBaseline.stddev !== null && <span className="text-[11px] text-white/40">±<span className="text-white/65 font-medium">{hrvBaseline.stddev}</span></span>}
                </div>
              )}
            </div>
            <div className="relative flex items-end gap-[2px] h-14">
              {hrv30.map((r, i) => {
                const v = r.hrv_rmssd as number
                const barH = Math.max((v / maxHRV) * 48, 4)
                const isLast = i === hrv30.length - 1
                return (
                  <div key={i} className="flex-1 rounded-sm" style={{
                    height: `${barH}px`,
                    background: isLast ? '#4ade80' : '#4ade8055',
                  }} />
                )
              })}
              {baselineH !== null && (
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-white/30 pointer-events-none"
                  style={{ bottom: `${baselineH}px` }}
                />
              )}
            </div>
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
  const { data: nutrition } = useSWR('food-weekly-nutrition', fetchWeeklyNutrition)
  const avgProtein = nutrition?.avgProtein ?? 0
  const proteinTarget = nutrition?.proteinTarget ?? 0

  const weightRows = rows.filter(r => r.gewicht != null).slice(0, period).reverse()
  const weights = weightRows.map(r => Number(r.gewicht))
  const latest = weights[weights.length - 1]
  const oldest = weights[0]
  const avg = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0
  const min = weights.length ? Math.min(...weights) : 0
  const max = weights.length ? Math.max(...weights) : 0
  const change = latest && oldest ? latest - oldest : 0

  const displayWeight = latest ?? null

  const daysDiff = weightRows.length > 1
    ? (new Date(weightRows[weightRows.length - 1].datum).getTime() - new Date(weightRows[0].datum).getTime()) / 86400000
    : 0
  const weeklyRate = daysDiff >= 3 && latest && oldest ? ((latest - oldest) / daysDiff) * 7 : null

  const chartWeights = weights
  const chartMin = weights.length ? Math.min(...weights) : 0
  const chartMax = weights.length ? Math.max(...weights) : 0

  return (
    <div className="flex flex-col gap-6">

      <AiInsight text={buildWeightInsight(weights, weeklyRate, change, avgProtein, proteinTarget)} />

      {/* Hero */}
      <div className="flex flex-col gap-2">
        <Scale size={22} className="text-cyan-400" />
        <div className="flex items-baseline gap-1">
          <span className="text-[56px] font-bold text-white leading-none">{displayWeight ? displayWeight.toFixed(1) : '–'}</span>
          <span className="text-[24px] font-semibold text-white/50 ml-1">kg</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-medium text-cyan-400">
            {change !== 0 ? `${change > 0 ? '+' : ''}${change.toFixed(1)} kg` : '–'}
          </span>
          {weeklyRate !== null && (
            <span className="text-[13px] text-white/40">
              {weeklyRate > 0 ? '+' : ''}{weeklyRate.toFixed(2)} kg/week
            </span>
          )}
        </div>
      </div>

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
  const stepRows7  = rows.filter(r => r.stappen != null).slice(0, 7).reverse()
  const stepRows30 = rows.filter(r => r.stappen != null).slice(0, 30).reverse()
  const steps7  = stepRows7.map(r => Number(r.stappen))
  const steps30 = stepRows30.map(r => Number(r.stappen))

  const todaySteps = steps7[steps7.length - 1] ?? 0
  const avgSteps7  = steps7.length ? Math.round(steps7.reduce((a, b) => a + b, 0) / steps7.length) : 0
  const avgSteps30 = steps30.length ? Math.round(steps30.reduce((a, b) => a + b, 0) / steps30.length) : 0
  const maxSteps   = steps30.length ? Math.max(...steps30) : stepGoal
  const distKm     = (todaySteps * 0.00075).toFixed(1)
  const goalsHit7  = steps7.filter(s => s >= stepGoal).length
  const goalHitPct = steps7.length ? Math.round((goalsHit7 / steps7.length) * 100) : null

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.08em]">Today</span>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[40px] font-bold text-white leading-none">{todaySteps ? todaySteps.toLocaleString('nl-NL') : '–'}</span>
                <span className="text-[15px] font-semibold text-white/50">steps</span>
              </div>
              <span className="text-[13px] text-white/40">{distKm} km estimated</span>
            </div>
            <RingChart progress={todaySteps / stepGoal} color="#f97316" label="" value={`${Math.round((todaySteps / stepGoal) * 100)}%`} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-[12px] px-3 py-2.5 flex flex-col gap-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-[10px] text-white/30 uppercase tracking-[0.08em]">7d avg</span>
          <span className="text-[15px] font-semibold text-orange-400">{avgSteps7 ? avgSteps7.toLocaleString('nl-NL') : '–'}</span>
        </div>
        <div className="rounded-[12px] px-3 py-2.5 flex flex-col gap-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-[10px] text-white/30 uppercase tracking-[0.08em]">30d avg</span>
          <span className="text-[15px] font-semibold text-blue-400">{avgSteps30 ? avgSteps30.toLocaleString('nl-NL') : '–'}</span>
        </div>
        <div className="rounded-[12px] px-3 py-2.5 flex flex-col gap-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-[10px] text-white/30 uppercase tracking-[0.08em]">Goal hit</span>
          <span className={`text-[15px] font-semibold ${goalHitPct !== null && goalHitPct >= 70 ? 'text-green-400' : 'text-yellow-400'}`}>
            {goalHitPct !== null ? `${goalsHit7}/7d` : '–'}
          </span>
        </div>
      </div>

      {steps30.length > 4 && (
        <Card>
          <SectionHeader title="30-Day Steps" detail={`avg ${avgSteps30.toLocaleString('nl-NL')}`} />
          <div className="flex items-end gap-[2px] h-16 mt-4">
            {steps30.map((v, i) => (
              <div key={i} className="flex-1 rounded-sm"
                style={{ height: `${Math.max((v / maxSteps) * 56, 3)}px`, background: i === steps30.length - 1 ? '#f97316' : 'rgba(255,255,255,0.15)' }} />
            ))}
          </div>
          {/* Goal line */}
          <div className="relative mt-1 h-[1px]" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="absolute right-0 text-[10px] text-white/25">{(stepGoal / 1000).toFixed(0)}K goal</div>
          </div>
        </Card>
      )}
    </div>
  )
}
