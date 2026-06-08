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
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function avg(vals: (number | null)[]): number | null {
  const clean = vals.filter((v): v is number => v !== null)
  return clean.length ? Math.round(clean.reduce((a, b) => a + b, 0) / clean.length) : null
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

function nightLabel(datum: string, idx: number): string {
  if (idx === 0) return 'Last night'
  const d = new Date(datum + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function SleepSection() {
  const { data: rows = [] } = useSWR<GezondheidsRow[]>('health-gezondheid', healthFetcher, SWR_OPTS)

  const sleepRows = rows.filter(r => r.slaap_minuten != null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const idx = Math.min(selectedIdx, Math.max(0, sleepRows.length - 1))
  const selected = sleepRows[idx]

  const totalMin    = selected?.slaap_minuten ?? null
  const score       = selected ? computeSleepScore(selected) : null
  const deep        = selected?.slaap_diep ?? null
  const light       = selected?.slaap_licht ?? null
  const rem         = selected?.slaap_rem ?? null
  const wake        = selected?.wakker_minuten ?? null
  const spo2        = selected?.spo2 ?? null
  const resp        = selected?.ademhalingsfrequentie ?? null
  const bedtimeMin  = selected?.slaap_start_min ?? null
  const wakeTimeMin = selected?.slaap_einde_min ?? null

  const last30 = sleepRows.slice(0, 30)
  const last7  = sleepRows.slice(0, 7)

  const avg30Score = avg(last30.map(computeSleepScore))
  const avg30Min   = avg(last30.map(r => r.slaap_minuten))
  const avg7Score  = avg(last7.map(computeSleepScore))
  const avg7Min    = avg(last7.map(r => r.slaap_minuten))

  const scoreDiff    = score !== null && avg30Score !== null ? score - avg30Score : null
  const durationDiff = totalMin !== null && avg30Min !== null ? totalMin - avg30Min : null

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
    ? 'Sync Fitbit to see your sleep quality data.'
    : (() => {
        const lines: string[] = []
        if (totalMin !== null && avg30Min !== null) {
          const diff = totalMin - avg30Min
          lines.push(`Sleep duration ${diff >= 0 ? 'exceeded' : 'was below'} your 30-day average by ${fmtMin(Math.abs(diff))}.`)
        }
        if (deepPct !== null)
          lines.push(`Deep sleep at ${deepPct}% — ${deepPct >= 20 ? 'within' : 'below'} the healthy 20–25% range.`)
        if (efficiency !== null)
          lines.push(`Sleep efficiency ${efficiency}%.`)
        return lines.join(' ') || 'Sleep data loaded.'
      })()

  return (
    <div className="flex flex-col gap-5">

      {/* Night selector — tap to view other nights */}
      {sleepRows.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {sleepRows.slice(0, 14).map((r, i) => {
            const s = computeSleepScore(r)
            const active = i === idx
            return (
              <button
                key={r.datum}
                onClick={() => setSelectedIdx(i)}
                className="shrink-0 rounded-[14px] px-3.5 py-2 flex flex-col items-start gap-0.5 transition-all"
                style={{
                  background: active ? 'rgba(129,140,248,0.18)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${active ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: active ? '#a5b4fc' : 'rgba(255,255,255,0.5)' }}>
                  {nightLabel(r.datum, i)}
                </span>
                <span className="text-[15px] font-bold text-white">{s ?? '–'}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Hero 4 metrics */}
      <div className="grid grid-cols-2 gap-3">
        <HeroCard
          label="Sleep Score"
          value={score !== null ? String(score) : '–'}
          diff={scoreDiff}
          formatDiff={d => `${Math.abs(Math.round(d))} pts`}
          tint="#818cf8"
        />
        <HeroCard
          label="Duration"
          value={totalMin ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : '–'}
          diff={durationDiff}
          formatDiff={d => fmtMin(Math.round(Math.abs(d)))}
          tint="#60a5fa"
        />
        <HeroCard
          label="Bedtime"
          value={fmtTime(bedtimeMin)}
          diff={null}
          formatDiff={() => ''}
          tint="rgba(255,255,255,0.75)"
        />
        <HeroCard
          label="Wake time"
          value={fmtTime(wakeTimeMin)}
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
            <span className="text-[12px] font-semibold text-white/50 uppercase tracking-[0.10em]">AI Insight</span>
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
            <StageLegend label={selected?.wakker_count != null ? `Awake · woke ${selected.wakker_count}×` : 'Awake'} color="rgba(255,255,255,0.30)"  duration={fmtMin(wake)}  pct={wakePct}  />
          </div>
        </div>
      </Card>

      {/* Quality Insights 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        <MiniCard
          title="Deep Sleep"
          value={deepPct !== null ? `${deepPct}%` : '–'}
          tint={deepPct !== null && deepPct >= 20 ? 'text-indigo-400' : 'text-yellow-400'}
        />
        <MiniCard
          title="REM Sleep"
          value={remPct !== null ? `${remPct}%` : '–'}
          tint={remPct !== null && remPct >= 20 ? 'text-purple-400' : 'text-yellow-400'}
        />
        <MiniCard
          title="Efficiency"
          value={efficiency !== null ? `${efficiency}%` : '–'}
          tint={efficiency !== null && efficiency >= 85 ? 'text-green-400' : 'text-yellow-400'}
        />
        <MiniCard
          title="Consistency"
          value={consistency !== null ? `${consistency}%` : '–'}
          tint={consistency !== null && consistency >= 80 ? 'text-teal-400' : 'text-yellow-400'}
        />
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

      {/* Secondary: SpO₂ / Resp / Awake */}
      <div className="flex flex-col gap-3">
        <span className="text-[13px] font-semibold text-white/30 uppercase tracking-[0.10em]">Also this night</span>
        <div className="grid grid-cols-3 gap-2">
          <MiniCard title="SpO₂"      value={spo2 !== null ? `${spo2}%` : '–'}   tint="text-teal-400" />
          <MiniCard title="Resp rate" value={resp !== null ? `${resp}/min` : '–'} tint="text-cyan-400" />
          <MiniCard title="Awake"     value={fmtMin(wake)}                         tint="text-white/50" />
        </div>
      </div>

    </div>
  )
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

export function RecoverySection() {
  const { data: rows = [] } = useSWR<GezondheidsRow[]>('health-gezondheid', healthFetcher, SWR_OPTS)

  const latest = rows[0]
  const hrv = latest?.hrv_rmssd ?? null
  const restingHR = latest?.hartslag_rust ?? null
  const sleepScore = latest ? computeSleepScore(latest) : null
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
