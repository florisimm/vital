import { PremiumScreen } from '@/components/PremiumScreen'
import { SectionHeader, SuggestionCard, MinimalWorkoutList } from '@/components/ui'

/* ─── CalendarRibbon ─────────────────────────────────────────────────────── */
// Matches Swift CalendarRibbon: 5 days, today (31) is white-filled, others translucent
function CalendarRibbon() {
  const days: [string, string][] = [
    ['S', '31'], ['M', '1'], ['T', '2'], ['W', '3'], ['T', '4'],
  ]
  return (
    <div className="flex gap-2.5">
      {days.map(([letter, num]) => {
        const isToday = num === '31'
        return (
          <div
            key={num}
            className="flex-1 flex flex-col items-center justify-center gap-[9px] h-[78px] rounded-[22px]"
            style={{
              background: isToday ? 'white' : 'rgba(255,255,255,0.08)',
              color: isToday ? 'black' : 'white',
            }}
          >
            <span className="text-[12px] font-semibold opacity-60">{letter}</span>
            <span className="text-[20px] font-bold">{num}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function SchedulePage() {
  return (
    <PremiumScreen title="Schedule" subtitle="Plan around readiness" contentGap={18}>
      <CalendarRibbon />
      <SectionHeader title="AI suggestions" detail="2 changes" />
      <SuggestionCard
        title="Move run to 15:00"
        detail="Rain expected at 18:00. Wind drops after 14:30."
        action="Apply change"
      />
      <SuggestionCard
        title="Add Zone 2 tomorrow"
        detail="30 minutes is optimal. Recovery expected to remain high."
        action="Add workout"
      />
      <MinimalWorkoutList
        title="Upcoming"
        workouts={['Mon · 30 min Zone 2', 'Wed · Strength', 'Fri · Restorative walk']}
      />
    </PremiumScreen>
  )
}
