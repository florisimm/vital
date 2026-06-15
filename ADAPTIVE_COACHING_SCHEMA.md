# Adaptive Coaching System — Database Schema

Complete database schema design for the adaptive coaching feedback system.

## Entity Relationship Diagram

```
┌─────────────────────────────┐
│      session_feedback       │
├─────────────────────────────┤
│ id (UUID)                   │
│ user_id (UUID, FK)          │
│ workout_date (TEXT)         │◄──┐
│ workout_type (TEXT)         │   │
│ workout_id (TEXT)           │   │
│ feedback_level (TEXT)       │   │
│ coach_advice (TEXT?)        │   │
│ created_at (TIMESTAMPTZ)    │   │
└─────────────────────────────┘   │
        ▲                          │
        │                          │
        │ references               │
        │                          │
┌───────┴──────────────────────────┴──┐
│         coach_overrides             │
├─────────────────────────────────────┤
│ id (UUID)                           │
│ user_id (UUID, FK)                  │
│ date (TEXT, PK with user_id)        │
│ coach_advice (TEXT)                 │
│ user_action (TEXT)                  │
│ session_feedback (TEXT?)             │◄── links to session_feedback
│ readiness_score_at_time (INT?)      │
│ recovery_score_at_time (INT?)       │
│ training_load_at_time (INT?)        │
│ session_notes (TEXT?)               │
│ created_at (TIMESTAMPTZ)            │
│ updated_at (TIMESTAMPTZ)            │
└─────────────────────────────────────┘
        ▲
        │
        │ analyzes
        │
┌───────┴───────────────────────────────┐
│   coach_bias_adjustments              │
├───────────────────────────────────────┤
│ id (UUID)                             │
│ user_id (UUID, FK, UNIQUE)            │
│ bias_adjustment (NUMERIC)             │
│ conservativeness_adjustment (NUMERIC) │
│ reason (TEXT)                         │
│ data_points_count (INT)               │
│ calculated_at (TIMESTAMPTZ)           │
│ updated_at (TIMESTAMPTZ)              │
└───────────────────────────────────────┘
```

## Table 1: session_feedback

Stores user-provided difficulty ratings for completed workouts.

```sql
CREATE TABLE IF NOT EXISTS session_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_date TEXT NOT NULL,
  workout_type TEXT NOT NULL,
  workout_id TEXT NOT NULL,
  feedback_level TEXT NOT NULL CHECK (
    feedback_level IN ('easier', 'about_right', 'hard', 'very_hard')
  ),
  coach_advice TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT session_feedback_user_workout_unique UNIQUE (user_id, workout_date, workout_id)
);

CREATE INDEX idx_session_feedback_user_date ON session_feedback(user_id, workout_date DESC);
CREATE INDEX idx_session_feedback_user_type ON session_feedback(user_id, workout_type);

ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own session feedback" ON session_feedback
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

## Table 2: coach_overrides

Tracks when users diverge from coach recommendations with full context.

```sql
CREATE TABLE IF NOT EXISTS coach_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  coach_advice TEXT NOT NULL,
  user_action TEXT NOT NULL,
  session_feedback TEXT CHECK (
    session_feedback IS NULL 
    OR session_feedback IN ('easier', 'about_right', 'hard', 'very_hard')
  ),
  readiness_score_at_time INTEGER CHECK (
    readiness_score_at_time IS NULL 
    OR (readiness_score_at_time >= 0 AND readiness_score_at_time <= 100)
  ),
  recovery_score_at_time INTEGER CHECK (
    recovery_score_at_time IS NULL 
    OR (recovery_score_at_time >= 0 AND recovery_score_at_time <= 100)
  ),
  training_load_at_time INTEGER CHECK (
    training_load_at_time IS NULL 
    OR (training_load_at_time >= 0 AND training_load_at_time <= 100)
  ),
  session_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT coach_overrides_user_date_unique UNIQUE (user_id, date)
);

CREATE INDEX idx_coach_overrides_user_date ON coach_overrides(user_id, date DESC);
CREATE INDEX idx_coach_overrides_user_advice ON coach_overrides(user_id, coach_advice);

ALTER TABLE coach_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own coach overrides" ON coach_overrides
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

## Table 3: coach_bias_adjustments

Stores learned adjustments to coach behavior, calculated weekly.

```sql
CREATE TABLE IF NOT EXISTS coach_bias_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bias_adjustment NUMERIC(4,3) NOT NULL,
  conservativeness_adjustment NUMERIC(4,3),
  reason TEXT NOT NULL,
  data_points_count INTEGER NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT coach_bias_single_user UNIQUE (user_id)
);

CREATE INDEX idx_coach_bias_user ON coach_bias_adjustments(user_id);

ALTER TABLE coach_bias_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own coach bias" ON coach_bias_adjustments
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

## Column Details

### session_feedback
- `workout_date`: YYYY-MM-DD format for date filtering
- `workout_id`: Links to strava_activities.id or hevy_workouts.id
- `feedback_level`: Enum validated at DB level
- `coach_advice`: Context snapshot, not for processing

### coach_overrides
- `coach_advice`: Standard values like "Rest", "Easy", "Tempo", "Threshold"
- `user_action`: What user actually did
- `readiness_score_at_time`: Snapshot when advice was given
- `session_feedback`: Nullable, linked after user provides rating

### coach_bias_adjustments
- `bias_adjustment`: -0.100 to +0.100, applied as multiplier
- `reason`: Human-readable explanation
- `data_points_count`: Audit trail of observations

## Query Patterns

Get user's feedback for a workout:
```sql
SELECT * FROM session_feedback
WHERE user_id = $1 AND workout_date = $2 AND workout_id = $3;
```

Find Rest overrides with positive feedback:
```sql
SELECT COUNT(*) as total, 
       SUM(CASE WHEN session_feedback IN ('easier', 'about_right') THEN 1 ELSE 0 END) as positive
FROM coach_overrides
WHERE user_id = $1 AND coach_advice ILIKE '%rest%'
  AND date >= (now()::date - 60);
```

Get current bias:
```sql
SELECT * FROM coach_bias_adjustments WHERE user_id = $1;
```

Update bias:
```sql
INSERT INTO coach_bias_adjustments (user_id, bias_adjustment, reason, data_points_count)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id) DO UPDATE SET 
  bias_adjustment = EXCLUDED.bias_adjustment,
  reason = EXCLUDED.reason,
  data_points_count = EXCLUDED.data_points_count,
  updated_at = NOW();
```

## RLS Security

All tables enforce users can only access their own data via row-level security policies attached above.

Admin access via `service_role` in Supabase dashboard if needed.

## Performance

- Index coverage on (user_id, date) for all tables
- Query time <50ms for 60-day analysis window
- Storage: ~5 MB/year for 1000 users

## Data Immutability

- session_feedback: Never deleted (audit trail)
- coach_overrides: Never deleted (full history)
- coach_bias_adjustments: Updated in place (one per user)
