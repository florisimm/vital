import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/* ─── Card shell ──────────────────────────────────────────────────────────── */
// padding 18, cornerRadius 24, bg white/0.075, border white/0.09
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`p-[18px] rounded-3xl border border-white/[0.09] ${className}`}
      style={{ background: 'rgba(255,255,255,0.075)' }}
    >
      {children}
    </div>
  )
}

/* ─── Section header ──────────────────────────────────────────────────────── */
// Swift: .font(.title3.bold()) title (~20pt), .font(.subheadline.weight(.semibold)) detail (15pt)
export function SectionHeader({ title, detail }: { title: string; detail?: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[20px] font-bold text-white">{title}</span>
      {detail != null && (
        <span className="text-[15px] font-semibold text-white/50">{detail}</span>
      )}
    </div>
  )
}

/* ─── Metric row ──────────────────────────────────────────────────────────── */
// Swift: .font(.headline) title+value (17pt semibold), .font(.subheadline) detail (15pt)
export function MetricRow({
  title,
  value,
  detail,
}: {
  title: string
  value: string
  detail: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-white text-[17px]">{title}</span>
        <span className="text-[15px] text-white/50">{detail}</span>
      </div>
      <span className="font-bold text-white text-[17px] text-right shrink-0">{value}</span>
    </div>
  )
}

/* ─── Metric tile ─────────────────────────────────────────────────────────── */
// Swift: icon (.title3=20pt), value (30pt bold), unit (.subheadline=15pt), title (.headline=17pt), note (.caption=12pt)
export function MetricTile({
  title,
  value,
  unit,
  note,
  Icon,
  tint,
}: {
  title: string
  value: string
  unit: string
  note: string
  Icon: LucideIcon
  tint: string
}) {
  return (
    <Card className="flex-1 flex flex-col gap-3.5">
      <Icon size={20} className={tint} />
      <div className="flex items-baseline gap-[3px]">
        <span className="text-[30px] font-bold text-white leading-none">{value}</span>
        {unit && (
          <span className="text-[15px] font-semibold text-white/50">{unit}</span>
        )}
      </div>
      <span className="font-semibold text-white text-[17px]">{title}</span>
      <span className="text-[12px] text-white/50">{note}</span>
    </Card>
  )
}

/* ─── Big metric card ─────────────────────────────────────────────────────── */
// Swift: icon (.title2=22pt), title (.body=17pt secondary), value (42pt bold), delta (.headline=17pt mint)
export function BigMetricCard({
  title,
  value,
  delta,
  Icon,
}: {
  title: string
  value: string
  delta: string
  Icon: LucideIcon
}) {
  return (
    <Card>
      <div className="flex flex-col gap-3.5">
        <Icon size={22} className="text-teal-400" />
        <span className="text-white/50 text-[17px]">{title}</span>
        <span className="text-[42px] font-bold text-white leading-none">{value}</span>
        <span className="font-semibold text-teal-400 text-[17px]">{delta}</span>
      </div>
    </Card>
  )
}

/* ─── Coach recommendation ────────────────────────────────────────────────── */
// Swift: rank (.caption.bold=12pt), title (.title3.bold=20pt), text (secondary body=17pt)
export function CoachRecommendation({
  rank,
  title,
  text,
}: {
  rank: string
  title: string
  text: string
}) {
  return (
    <Card>
      <div className="flex items-start gap-4">
        <span className="w-[34px] h-[34px] rounded-full bg-white text-black text-[11px] font-bold flex items-center justify-center shrink-0">
          {rank}
        </span>
        <div className="flex flex-col gap-2">
          <span className="text-[20px] font-bold text-white">{title}</span>
          <span className="text-white/50 leading-relaxed text-[17px]">{text}</span>
        </div>
      </div>
    </Card>
  )
}

/* ─── Category strip ──────────────────────────────────────────────────────── */
// Swift: .font(.subheadline.weight(.semibold)) = 15pt, HStack spacing 10, px 16, py 10, .capsule
export function CategoryStrip({ items }: { items: string[] }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto">
      {items.map((item, i) => (
        <span
          key={item}
          className="whitespace-nowrap px-4 py-2.5 rounded-full text-[15px] font-semibold shrink-0"
          style={
            i === 0
              ? { background: 'white', color: 'black' }
              : { background: 'rgba(255,255,255,0.08)', color: 'white' }
          }
        >
          {item}
        </span>
      ))}
    </div>
  )
}

/* ─── Minimal workout list ────────────────────────────────────────────────── */
// Swift: workout text .font(.headline)=17pt, .padding(.vertical, 4)
export function MinimalWorkoutList({
  title,
  workouts,
}: {
  title: string
  workouts: string[]
}) {
  return (
    <Card>
      <div className="flex flex-col gap-3.5">
        <SectionHeader title={title} />
        {workouts.map((w, i) => (
          <span key={i} className="font-semibold text-white text-[17px] py-1">
            {w}
          </span>
        ))}
      </div>
    </Card>
  )
}

/* ─── Nutrition progress bar ─────────────────────────────────────────────── */
// Swift NutritionProgressBar: label (subheadline semibold), value text, capsule fill bar
export function NutritionProgressBar({
  label,
  current,
  target,
  unit,
  tint,
}: {
  label: string
  current: number
  target: number
  unit: string
  tint: string  // Tailwind bg color class, e.g. 'bg-orange-400'
}) {
  const progress = target > 0 ? Math.min(current / target, 1) : 0
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-white/50">{label}</span>
        <span className="text-[15px] font-medium text-white/80">
          {Math.round(current)} / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }}>
        <div
          className={`h-full rounded-full ${tint} transition-all duration-500`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}

/* ─── Suggestion card ─────────────────────────────────────────────────────── */
// Swift: title .title3.bold=20pt, detail secondary, button .headline=17pt px16 py10 .capsule
export function SuggestionCard({
  title,
  detail,
  action,
}: {
  title: string
  detail: string
  action: string
}) {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <span className="text-[20px] font-bold text-white">{title}</span>
        <span className="text-white/50 text-[17px]">{detail}</span>
        <button
          className="self-start px-4 py-2.5 rounded-full text-[17px] font-semibold text-white"
          style={{ background: 'rgba(255,255,255,0.10)' }}
        >
          {action}
        </button>
      </div>
    </Card>
  )
}
