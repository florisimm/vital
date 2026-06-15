# Quick Start: Adaptive Coaching System

Get the adaptive coaching system running in 15 minutes.

## 1. Run Database Migration (2 minutes)

```bash
# Using Supabase CLI
supabase db push

# Or in Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Copy-paste: migrations/0002_session_feedback.sql
# 3. Click "Run"
```

Verify tables exist:
```sql
SELECT * FROM session_feedback LIMIT 1;
SELECT * FROM coach_overrides LIMIT 1;
SELECT * FROM coach_bias_adjustments LIMIT 1;
```

## 2. Add Session Feedback to Running Page (5 minutes)

**File: `app/training/running/page.tsx`**

Add these imports:
```tsx
import { SessionFeedbackCard } from '@/app/training/SessionFeedbackCard'
import { useSessionFeedback } from '@/app/training/useSessionFeedback'
```

Add to component:
```tsx
export default function RunningPage() {
  const { data } = useSWR('training', trainingFetcher)
  const workout = useSessionFeedback(data?.activities ?? [], data?.hevy ?? [])  // NEW

  return (
    <TrainingDetailScreen title="Running" active="Running">
      <RunningSection activities={data?.activities ?? []} />
      
      {/* NEW: Add this */}
      {workout && (
        <SessionFeedbackCard
          workoutDate={workout.date}
          workoutType={workout.type}
          workoutId={workout.id}
        />
      )}
    </TrainingDetailScreen>
  )
}
```

## 3. Add Confidence Indicator to Readiness (5 minutes)

**File: `app/training/running/page.tsx`** (same file)

Add import:
```tsx
import { ReadinessConfidenceIndicator } from '@/components/ReadinessConfidenceIndicator'
import { computePhysiologyReadiness } from '@/lib/readiness'
```

Add to component (before SessionFeedbackCard):
```tsx
const readiness = computePhysiologyReadiness(
  health ?? [],
  data?.activities ?? [],
  data?.hevy ?? []
)

return (
  <TrainingDetailScreen title="Running" active="Running">
    {/* NEW: Show readiness with confidence */}
    {readiness.score !== null && (
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-[40px] font-bold">{readiness.score}%</span>
          {readiness.confidence && (
            <ReadinessConfidenceIndicator 
              confidence={readiness.confidence} 
              compact={true}
            />
          )}
        </div>
      </Card>
    )}
    
    <RunningSection activities={data?.activities ?? []} />
    {workout && (
      <SessionFeedbackCard
        workoutDate={workout.date}
        workoutType={workout.type}
        workoutId={workout.id}
      />
    )}
  </TrainingDetailScreen>
)
```

## 4. Test It (3 minutes)

1. **Create a test workout** in Strava/Hevy (or backdate a recent one)
2. **Go to Running page** → SessionFeedbackCard should appear if <12 hours old
3. **Click a feedback button** → Success message appears
4. **Check database**:
   ```sql
   SELECT * FROM session_feedback WHERE user_id = 'your-user-id';
   ```

Done! Step 1 is live.

---

## Next Steps (When Ready)

### Phase 2: Coach Overrides
When you have coach advice generating in the Training tab, create an endpoint:

```typescript
// app/api/training/create-coach-override/route.ts
export async function POST(request: NextRequest) {
  const { date, coach_advice, user_action, readiness_score_at_time } = await request.json()
  // Insert into coach_overrides table
}
```

### Phase 3: Learning Analysis
Set up weekly analysis:

```bash
# vercel.json
{
  "crons": [{
    "path": "/api/cron/coaching-analysis",
    "schedule": "0 9 * * 1"
  }]
}
```

### Phase 4: Display Adjustments
Show users their coach adjustments (optional, nice-to-have feature)

---

## Troubleshooting

### SessionFeedbackCard doesn't appear
- Check: Workout from last 12 hours? (Strava shows recent activities)
- Check: useSessionFeedback returning non-null?
  ```tsx
  const workout = useSessionFeedback(activities, hevy)
  console.log('workout:', workout) // Should log object if recent workout exists
  ```

### Data not saving to database
- Check: Browser console for API errors
- Check: RLS policy on session_feedback table
  ```sql
  SELECT * FROM session_feedback LIMIT 1;
  -- Should return data if authed user
  ```

### Confidence indicator not showing
- Check: `readiness.confidence` is present?
  ```tsx
  console.log('confidence:', readiness.confidence)
  ```
- Check: computePhysiologyReadiness updated with confidence field

---

## Files Summary

| File | Purpose | Status |
|------|---------|--------|
| `app/training/SessionFeedbackCard.tsx` | UI component | DONE ✓ |
| `app/api/training/session-feedback/route.ts` | Save feedback API | DONE ✓ |
| `app/training/useSessionFeedback.ts` | Hook to find workouts | DONE ✓ |
| `lib/readiness.ts` | Updated with confidence | DONE ✓ |
| `components/ReadinessConfidenceIndicator.tsx` | Confidence badge UI | DONE ✓ |
| `lib/coaching-learn.ts` | Learning rules engine | DONE (ready for Phase 3) |
| `migrations/0002_session_feedback.sql` | Database schema | DONE ✓ |

---

## Key Files to Read

- **System overview**: `ADAPTIVE_COACHING_SUMMARY.md`
- **Complete guide**: `ADAPTIVE_COACHING_GUIDE.md`
- **Code examples**: `IMPLEMENTATION_EXAMPLE.md`
- **Database schema**: `ADAPTIVE_COACHING_SCHEMA.md`
- **Types reference**: `lib/adaptive-coaching-types.ts`

---

## Architecture Summary

```
SessionFeedbackCard (UI)
  → /api/training/session-feedback (POST)
    → session_feedback table (INSERT)

computePhysiologyReadiness()
  + readiness.confidence

ReadinessConfidenceIndicator (UI)
  ← displays confidence level

[Later] coach_overrides → analyzeCoachingPatterns() → coach_bias_adjustments
```

---

That's it! You now have:
- ✓ Session feedback collection
- ✓ Confidence indicators
- ✓ Database schema
- ✓ Learning rules (ready for implementation)

Next: integrate into other training pages (Cycling, Strength, etc.)
