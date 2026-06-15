# Adaptive Coaching Feedback System

A complete system for collecting user feedback on training sessions and using that data to improve coach recommendations over time.

## Overview

The adaptive coaching system has 4 integrated components:

1. **Session Feedback Collection** — UI component + API to capture user difficulty ratings
2. **Override Tracking Database** — Schema to record when users diverge from advice
3. **Learning Rules Engine** — Simple rule-based logic to detect coach adjustment opportunities
4. **Confidence Indicators** — Data quality metrics for readiness scores

---

## Step 1: Session Feedback Component

### Files
- `app/training/SessionFeedbackCard.tsx` — UI component
- `app/api/training/session-feedback/route.ts` — API endpoint
- `app/training/useSessionFeedback.ts` — Hook to find workouts needing feedback
- `migrations/0002_session_feedback.sql` — `session_feedback` table

### Quick Start

Add the feedback card to any training section after a completed workout:

```tsx
import { SessionFeedbackCard } from '@/app/training/SessionFeedbackCard'
import { useSessionFeedback } from '@/app/training/useSessionFeedback'

export function RunningSection({ activities, hevy }) {
  const workout = useSessionFeedback(activities, hevy)

  return (
    <>
      {/* ... existing running content ... */}
      {workout && (
        <SessionFeedbackCard
          workoutDate={workout.date}
          workoutType={workout.type}
          workoutId={workout.id}
          coachAdvice="Easy run"
          onFeedbackSubmitted={() => {
            // Optionally refresh data or show success
          }}
        />
      )}
    </>
  )
}
```

### Behavior

- Only shows for workouts completed in the last 12 hours
- 4 feedback options: "Easier", "About right", "Hard", "Very hard"
- Auto-hides after submission with success message
- Stores to `session_feedback` table with user_id, workout_id, timestamp

### Database Schema

```sql
session_feedback (
  id UUID PRIMARY KEY,
  user_id UUID,
  workout_date TEXT (YYYY-MM-DD),
  workout_type TEXT (running|cycling|strength|swimming),
  workout_id TEXT (strava activity id or hevy workout id),
  feedback_level TEXT (easier|about_right|hard|very_hard),
  coach_advice TEXT (optional),
  created_at TIMESTAMPTZ
)
```

---

## Step 2: Override Tracking Data Structure

### Files
- `migrations/0002_session_feedback.sql` — `coach_overrides` and `coach_bias_adjustments` tables

### Purpose

Track when users override coach advice (e.g., resting when told to, or doing a hard workout when told to rest).

### Schema

```sql
coach_overrides (
  id UUID PRIMARY KEY,
  user_id UUID,
  date TEXT (YYYY-MM-DD),
  coach_advice TEXT (e.g. "Rest Day", "Light Workout", "Zone 2 Run"),
  user_action TEXT (e.g. "Skipped", "Light workout", "Hard workout"),
  session_feedback TEXT (easier|about_right|hard|very_hard),
  readiness_score_at_time INTEGER (0-100),
  recovery_score_at_time INTEGER (0-100),
  training_load_at_time INTEGER (0-100),
  session_notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

coach_bias_adjustments (
  id UUID PRIMARY KEY,
  user_id UUID,
  bias_adjustment NUMERIC (-0.100 to +0.100),
  conservativeness_adjustment NUMERIC (-0.100 to +0.100),
  reason TEXT,
  data_points_count INTEGER,
  calculated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

### When to Populate

Populate `coach_overrides` when:
1. Coach gives training advice (ready/rest/type/intensity)
2. User completes a different workout (or skips)
3. Session feedback is collected

Example flow:
```
Coach says: "Rest Day" (readiness 45%)
  ↓
User does: Running session (ignoring advice)
  ↓
User feedback: "About right" (felt easy)
  ↓
→ Insert to coach_overrides with all metrics
```

---

## Step 3: Learning Rules Engine

### Files
- `lib/coaching-learn.ts` — Pattern analysis and adjustment calculation

### Functions

#### `analyzeCoachingPatterns(userId: string)`

Analyzes recent coach overrides (last 60 days) to detect patterns:

**Rule 1: Coach too conservative**
- Detects: User overrides "Rest"/"Easy" advice 5+ times with "About right" or "Easier" feedback (60%+)
- Result: `bias_adjustment: +0.05` (raise readiness by 5%)
- Reasoning: User feels good when resting would be advised → increase readiness thresholds

**Rule 2: Coach underestimates difficulty**
- Detects: User does hard workouts 3+ times with "Very hard" feedback (60%+)
- Result: `bias_adjustment: -0.05` (lower readiness by 5%)
- Reasoning: Workouts feel much harder than recommended → be more conservative

**Returns:** `CoachingAdjustment | null`
```typescript
{
  bias_adjustment: number (-0.100 to +0.100),
  conservativeness_adjustment: number (-0.100 to +0.100),
  confidence: 'high' | 'medium' | 'low',
  reason: string,
  data_points_count: number
}
```

#### `getCoachBiasMultiplier(userId: string)`

Returns a multiplier (0.9 to 1.1) to apply to readiness scores:
- 1.0 = no adjustment
- 1.05 = raise by 5%
- 0.95 = lower by 5%

**Usage in readiness calculation:**
```typescript
const baseReadiness = computePhysiologyReadiness(rows, activities, hevy)
const biasMultiplier = await getCoachBiasMultiplier(userId)
const adjustedScore = Math.round(baseReadiness.score * biasMultiplier)
```

#### `storeCoachingAdjustment(userId, adjustment)`

Saves the calculated adjustment to `coach_bias_adjustments` table.

**Usage:**
```typescript
const pattern = await analyzeCoachingPatterns(userId)
if (pattern) {
  await storeCoachingAdjustment(userId, pattern)
}
```

### Integration Points

1. **When to run analysis:**
   - Weekly scheduled job (cron)
   - On-demand when reviewing coach performance
   - On user request to "improve coaching"

2. **When to apply adjustments:**
   - Every readiness calculation (client-side: multiply by bias multiplier)
   - Every coach recommendation (multiply thresholds)

---

## Step 4: Confidence Indicators

### Files
- `lib/readiness.ts` — `ReadinessConfidence` type + `computeReadinessConfidence()` helper
- `components/ReadinessConfidenceIndicator.tsx` — UI component

### Updated Return Type

`computePhysiologyReadiness()` now returns:

```typescript
{
  score: number | null,
  label: string,
  color: string,
  components: { sleep, hrv, training_load },
  explanation: ReadinessExplanation,
  confidence: {
    level: 'high' | 'medium' | 'low',
    reason: string,
    data_days: number
  }
}
```

### Confidence Levels

**High** (green ✓)
- 10+ days health data AND 5+ training days
- Reason: "Sufficient data from X health days and Y training days"

**Medium** (yellow ○)
- 5-10 health days OR 3-5 training days
- Reason: "Some data missing: X health days, Y training days"

**Low** (orange ⚠)
- <5 health days AND <5 training days
- Reason: "Limited data: only X health days and Y training days"

### UI Integration

Add to any readiness display:

```tsx
import { ReadinessConfidenceIndicator } from '@/components/ReadinessConfidenceIndicator'

export function ReadinessCard({ readiness }) {
  return (
    <>
      <div className="text-[40px] font-bold">{readiness.score}%</div>
      {readiness.confidence && (
        <ReadinessConfidenceIndicator
          confidence={readiness.confidence}
          compact={true}
        />
      )}
    </>
  )
}
```

---

## Implementation Roadmap

### Phase 1: Session Feedback (DONE)
- [x] SessionFeedbackCard component
- [x] API route to save feedback
- [x] session_feedback table schema
- [x] Hook to detect workouts needing feedback
- Status: **Ready for integration into training pages**

### Phase 2: Override Tracking (Design Complete)
- [x] coach_overrides table schema with all metrics
- [x] coach_bias_adjustments table for learned adjustments
- [ ] API endpoint to insert overrides (tie to coach advice flow)
- [ ] Background job to link overrides with session feedback
- Status: **Ready to implement when coach advice is shown**

### Phase 3: Learning Engine (Design Complete)
- [x] analyzeCoachingPatterns() function
- [x] Rule logic for conservativeness detection
- [x] getCoachBiasMultiplier() for score adjustment
- [x] storeCoachingAdjustment() to persist learnings
- [ ] Weekly cron job to run analysis
- [ ] Admin endpoint to view adjustment decisions
- Status: **Ready to implement after Phase 2**

### Phase 4: Confidence Indicators (DONE)
- [x] ReadinessConfidence type
- [x] computeReadinessConfidence() helper
- [x] ReadinessConfidenceIndicator component
- [x] Updated computePhysiologyReadiness return type
- Status: **Ready to integrate into UI**

---

## Testing Checklist

### Session Feedback (Step 1)
- [ ] SessionFeedbackCard appears after workouts completed <12h ago
- [ ] All 4 feedback buttons submit correctly
- [ ] Success message appears for 2 seconds
- [ ] Error messages display if API fails
- [ ] Data saved correctly to session_feedback table
- [ ] Component hides when no recent workouts

### Override Tracking (Step 2)
- [ ] coach_overrides records inserted with all metrics
- [ ] Linked correctly to session_feedback by workout_id
- [ ] RLS policies prevent cross-user data access
- [ ] readiness_score_at_time captures correct value

### Learning Engine (Step 3)
- [ ] analyzeCoachingPatterns() detects Rest overrides correctly
- [ ] analyzeCoachingPatterns() detects Hard workout patterns
- [ ] bias_adjustment calculated correctly (-0.1 to +0.1)
- [ ] getCoachBiasMultiplier() returns 0.9-1.1 range
- [ ] Multiplier applied correctly in readiness calculation

### Confidence Indicators (Step 4)
- [ ] ReadinessConfidenceIndicator renders with correct colors
- [ ] Confidence level correct based on data availability
- [ ] Compact mode works in tight spaces
- [ ] Reason text is helpful and accurate

---

## Example: Adding Feedback to Running Page

```tsx
// app/training/running/page.tsx
'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { RunningSection } from '../sections'
import { trainingFetcher } from '../fetcher'
import { SessionFeedbackCard } from '../SessionFeedbackCard'
import { useSessionFeedback } from '../useSessionFeedback'

export default function RunningPage() {
  const { data } = useSWR('training', trainingFetcher)
  const workout = useSessionFeedback(data?.activities ?? [], data?.hevy ?? [])

  return (
    <TrainingDetailScreen title="Running" active="Running">
      <RunningSection activities={data?.activities ?? []} />
      
      {workout && (
        <SessionFeedbackCard
          workoutDate={workout.date}
          workoutType={workout.type}
          workoutId={workout.id}
          onFeedbackSubmitted={() => {
            // Optional: refetch data or show notification
          }}
        />
      )}
    </TrainingDetailScreen>
  )
}
```

---

## Future Enhancements

1. **Multi-factor override analysis**: Consider time of day, workout type, recovery vs consistency
2. **Confidence weighting**: Use confidence level when making learning decisions
3. **User override dashboard**: Show users why coach adjusted recommendations
4. **A/B testing**: Test different adjustment rates to find optimal sensitivity
5. **Fatigue detection**: Identify patterns where users ignore advice due to fatigue
6. **Sport-specific learning**: Track patterns separately for running vs cycling vs strength

---

## Database Migrations

Apply in order:

```bash
# 1. Initial schema (already done)
supabase migration up 0001_coach_overrides.sql

# 2. Session feedback + confidence tables
supabase migration up 0002_session_feedback.sql
```

Or manually:
```sql
psql $SUPABASE_CONNECTION_STRING -f migrations/0001_coach_overrides.sql
psql $SUPABASE_CONNECTION_STRING -f migrations/0002_session_feedback.sql
```
