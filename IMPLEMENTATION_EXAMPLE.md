# Adaptive Coaching System — Implementation Examples

Complete code examples showing how to integrate each step of the adaptive coaching system.

## Step 1: Add Feedback Card to Running Page

**File: `app/training/running/page.tsx`**

```tsx
'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { RunningSection } from '../sections'
import { trainingFetcher } from '../fetcher'
import { SessionFeedbackCard } from '../SessionFeedbackCard'
import { useSessionFeedback } from '../useSessionFeedback'

export default function RunningPage() {
  const { data } = useSWR('training', trainingFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })
  const workout = useSessionFeedback(data?.activities ?? [], data?.hevy ?? [])

  return (
    <TrainingDetailScreen title="Running" active="Running">
      <div className="space-y-4 pb-20">
        <RunningSection activities={data?.activities ?? []} />
        
        {/* Show feedback card if there's a recent workout */}
        {workout && (
          <SessionFeedbackCard
            workoutDate={workout.date}
            workoutType={workout.type}
            workoutId={workout.id}
            coachAdvice="Easy run"
            onFeedbackSubmitted={() => {
              // Optional: Trigger a refresh or show notification
              console.log('Feedback submitted, could refresh here')
            }}
          />
        )}
      </div>
    </TrainingDetailScreen>
  )
}
```

## Step 2: Display Readiness with Confidence Indicator

**File: `app/training/running/page.tsx` (updated)**

```tsx
'use client'

import useSWR from 'swr'
import { TrainingDetailScreen } from '@/components/TrainingDetailScreen'
import { RunningSection } from '../sections'
import { trainingFetcher } from '../fetcher'
import { SessionFeedbackCard } from '../SessionFeedbackCard'
import { useSessionFeedback } from '../useSessionFeedback'
import { ReadinessConfidenceIndicator } from '@/components/ReadinessConfidenceIndicator'
import { computePhysiologyReadiness } from '@/lib/readiness'
import { Card } from '@/components/ui'
import useSWR from 'swr'

async function healthFetcher() {
  const response = await fetch('/api/health')
  return response.json()
}

export default function RunningPage() {
  const { data: training } = useSWR('training', trainingFetcher)
  const { data: health } = useSWR('health-gezondheid', healthFetcher)
  const workout = useSessionFeedback(training?.activities ?? [], training?.hevy ?? [])

  const readiness = computePhysiologyReadiness(
    health ?? [],
    training?.activities ?? [],
    training?.hevy ?? []
  )

  return (
    <TrainingDetailScreen title="Running" active="Running">
      <div className="space-y-4 pb-20">
        {/* Readiness with confidence indicator */}
        {readiness.score !== null && (
          <Card>
            <div className="flex flex-col gap-3">
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-[40px] font-bold text-white">{readiness.score}%</span>
                  <span className="text-[12px] text-white/50 block mt-1">{readiness.label}</span>
                </div>
              </div>
              
              {/* Show confidence badge */}
              <ReadinessConfidenceIndicator 
                confidence={readiness.confidence} 
                compact={true}
              />
            </div>
          </Card>
        )}

        <RunningSection activities={training?.activities ?? []} />
        
        {workout && (
          <SessionFeedbackCard
            workoutDate={workout.date}
            workoutType={workout.type}
            workoutId={workout.id}
          />
        )}
      </div>
    </TrainingDetailScreen>
  )
}
```

## Step 3: Create Coach Override Record with Session

**File: `app/api/training/create-coach-override/route.ts`**

```typescript
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient(await cookies())
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      date,
      coach_advice,
      user_action,
      readiness_score_at_time,
      recovery_score_at_time,
      training_load_at_time,
    } = body

    const { error } = await supabase
      .from('coach_overrides')
      .insert({
        user_id: user.id,
        date,
        coach_advice,
        user_action,
        readiness_score_at_time,
        recovery_score_at_time,
        training_load_at_time,
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

## Step 4: Set Up Weekly Learning Analysis

**File: `lib/coaching-learn-cron.ts` (for scheduled job)**

```typescript
// This would be called by a cron job (e.g., Vercel Cron, Supabase Edge Function)
// Every Monday morning or weekly

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { analyzeCoachingPatterns, storeCoachingAdjustment } from './coaching-learn'
import { cookies } from 'next/headers'

export async function runWeeklyCoachingAnalysis() {
  const supabase = createServerSupabaseClient(await cookies())

  // Get all users
  const { data: users, error: usersError } = await supabase
    .from('auth.users')
    .select('id')

  if (usersError || !users) {
    console.error('Failed to fetch users:', usersError)
    return
  }

  console.log(`Running coaching analysis for ${users.length} users`)

  // Analyze each user's patterns
  for (const user of users) {
    try {
      const adjustment = await analyzeCoachingPatterns(user.id)
      
      if (adjustment) {
        await storeCoachingAdjustment(user.id, adjustment)
        console.log(`Updated bias for user ${user.id}: ${adjustment.reason}`)
      }
    } catch (err) {
      console.error(`Error analyzing user ${user.id}:`, err)
    }
  }

  console.log('Coaching analysis complete')
}
```

**File: `app/api/cron/coaching-analysis/route.ts` (Vercel Cron)**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { runWeeklyCoachingAnalysis } from '@/lib/coaching-learn-cron'

// Set this in vercel.json:
// {
//   "crons": [{
//     "path": "/api/cron/coaching-analysis",
//     "schedule": "0 9 * * 1"  // Every Monday at 9 AM
//   }]
// }

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await runWeeklyCoachingAnalysis()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Cron error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
```

## Step 5: Apply Bias Adjustment in Readiness Calculation

**File: `lib/readiness.ts` (updated in computePhysiologyReadiness)**

```typescript
import { getCoachBiasMultiplier } from './coaching-learn'

export async function computePhysiologyReadinessWithAdjustment(
  userId: string,
  rows: HealthRow[],
  activities: Activity[] = [],
  hevy: HevyWorkout[] = []
) {
  const baseReadiness = computePhysiologyReadiness(rows, activities, hevy)

  // Apply learned bias adjustment
  if (baseReadiness.score !== null) {
    const biasMultiplier = await getCoachBiasMultiplier(userId)
    const adjustedScore = Math.round(baseReadiness.score * biasMultiplier)

    return {
      ...baseReadiness,
      score: adjustedScore,
      label: adjustedScore >= 80 ? 'Peak'
        : adjustedScore >= 65 ? 'Good'
        : adjustedScore >= 50 ? 'Moderate'
        : 'Low',
    }
  }

  return baseReadiness
}
```

## Step 6: Show User Their Coach Adjustment History

**File: `app/coach/AdjustmentHistory.tsx` (new page)**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, SectionHeader } from '@/components/ui'

interface Adjustment {
  id: string
  date: string
  coach_advice: string
  user_action: string
  session_feedback: string | null
  readiness_score_at_time: number
}

export function AdjustmentHistory() {
  const [overrides, setOverrides] = useState<Adjustment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchOverrides = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('coach_overrides')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(20)

      setOverrides(data ?? [])
      setLoading(false)
    }

    fetchOverrides()
  }, [])

  if (loading) return <div className="text-white/50">Loading...</div>

  return (
    <>
      <SectionHeader title="Recent overrides" />
      
      {overrides.length === 0 ? (
        <p className="text-white/50 text-[14px]">No overrides yet. Keep using the app!</p>
      ) : (
        <div className="space-y-2">
          {overrides.map((override) => (
            <Card key={override.id}>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] text-white/70">{override.date}</span>
                    <span className="text-[14px] font-semibold text-white">
                      Coach: {override.coach_advice}
                    </span>
                  </div>
                  <span className="text-[12px] font-semibold text-teal-400">
                    {override.readiness_score_at_time}%
                  </span>
                </div>
                
                <div className="flex gap-2 items-center">
                  <span className="text-white/50">→</span>
                  <span className="text-[13px] text-white">{override.user_action}</span>
                  {override.session_feedback && (
                    <span className="text-[11px] text-white/40 ml-auto">
                      ({override.session_feedback})
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
```

## Step 7: Add Admin View for Bias Adjustments

**File: `app/admin/coach-calibration/page.tsx` (admin only)**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, SectionHeader } from '@/components/ui'

interface BiasAdjustment {
  user_id: string
  bias_adjustment: number
  reason: string
  data_points_count: number
  updated_at: string
}

export default function CoachCalibrationPage() {
  const [adjustments, setAdjustments] = useState<BiasAdjustment[]>([])

  useEffect(() => {
    const fetchAdjustments = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('coach_bias_adjustments')
        .select('*')
        .order('updated_at', { ascending: false })

      setAdjustments(data ?? [])
    }

    fetchAdjustments()
  }, [])

  return (
    <div className="p-5 space-y-4">
      <SectionHeader title="Coach Bias Adjustments" />
      
      {adjustments.map((adj) => (
        <Card key={adj.user_id}>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <span className="text-[13px] text-white/70">{adj.user_id.slice(0, 8)}</span>
              <span className={`text-[13px] font-semibold ${
                adj.bias_adjustment > 0 ? 'text-emerald-400' : 'text-orange-400'
              }`}>
                {adj.bias_adjustment > 0 ? '+' : ''}{(adj.bias_adjustment * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-[12px] text-white/60">{adj.reason}</p>
            <span className="text-[11px] text-white/40">
              {adj.data_points_count} data points
            </span>
          </div>
        </Card>
      ))}
    </div>
  )
}
```

## Data Flow Diagram

```
User completes workout
        ↓
SessionFeedbackCard appears
        ↓
User selects difficulty (easier/about_right/hard/very_hard)
        ↓
API saves to session_feedback table
        ↓
                    ↓
            Coach gave advice?
                    ↓
        Create coach_overrides record
                    ↓
        Weekly cron: analyzeCoachingPatterns()
                    ↓
        Patterns detected? (5+ Rest overrides, etc)
                    ↓
        Store to coach_bias_adjustments
                    ↓
        Next readiness calculation:
        score * bias_multiplier → adjusted score
                    ↓
        Display with confidence indicator
```

## Testing Examples

### Test Session Feedback

```bash
curl -X POST http://localhost:3000/api/training/session-feedback \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "uuid-here",
    "workout_date": "2026-06-15",
    "workout_type": "running",
    "workout_id": "activity-123",
    "feedback_level": "about_right",
    "coach_advice": "Easy run"
  }'
```

### Test Coach Override

```bash
curl -X POST http://localhost:3000/api/training/create-coach-override \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-06-15",
    "coach_advice": "Rest Day",
    "user_action": "Did running session",
    "readiness_score_at_time": 45,
    "recovery_score_at_time": 52,
    "training_load_at_time": 65
  }'
```

### Test Learning Analysis

```bash
curl -X GET http://localhost:3000/api/cron/coaching-analysis \
  -H "Authorization: Bearer your-cron-secret"
```

## Configuration

### Environment Variables

```env
# In .env.local for cron job
CRON_SECRET=your-secret-here

# In Vercel settings
CRON_SECRET=your-secret-here
```

### Vercel Configuration

**File: `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/coaching-analysis",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

---

This implementation creates a complete feedback loop where user behavior teaches the coach to be more appropriate for each individual's style and capabilities.
