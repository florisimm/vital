-- Step 1: Session feedback collection
-- Captures user's perceived difficulty and effort for completed workouts
-- Used to calibrate future coach recommendations

CREATE TABLE IF NOT EXISTS session_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Session identifiers
  workout_date TEXT NOT NULL,           -- YYYY-MM-DD format
  workout_type TEXT NOT NULL,           -- 'running', 'cycling', 'strength', 'swimming'
  workout_id TEXT NOT NULL,             -- strava activity id or hevy workout id

  -- Feedback data
  feedback_level TEXT NOT NULL CHECK (feedback_level IN ('easier', 'about_right', 'hard', 'very_hard')),
  coach_advice TEXT,                    -- optional: what coach recommended at the time

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT session_feedback_user_workout_unique UNIQUE (user_id, workout_date, workout_id)
);

CREATE INDEX idx_session_feedback_user_date ON session_feedback(user_id, workout_date DESC);
CREATE INDEX idx_session_feedback_user_type ON session_feedback(user_id, workout_type);

ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own session feedback" ON session_feedback
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 2: Enhanced coach_overrides table
-- Tracks when coach advice diverges from user action, with contextual metrics
-- Enables analysis of coach conservativeness and calibration opportunities

CREATE TABLE IF NOT EXISTS coach_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Date context
  date TEXT NOT NULL,                   -- YYYY-MM-DD when override occurred

  -- Sport context — CRITICAL for sport-specific learning
  sport_type TEXT NOT NULL,             -- 'running', 'cycling', 'strength', 'swimming'

  -- Coach vs user action
  coach_advice TEXT NOT NULL,           -- e.g. "Rest Day", "Light Workout", "Zone 2 Run"
  user_action TEXT NOT NULL,            -- e.g. "Skipped", "Light workout", "Hard workout"

  -- Outcome feedback
  session_feedback TEXT,                -- null (not evaluated yet), 'easier', 'about_right', 'hard', 'very_hard'

  -- Readiness context at time of advice
  readiness_score_at_time INTEGER,      -- 0-100, readiness % shown to user
  recovery_score_at_time INTEGER,       -- 0-100, recovery % shown to user
  training_load_at_time INTEGER,        -- 0-100, training load % shown to user

  -- Metadata
  session_notes TEXT,                   -- optional user notes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coach_overrides_user_date ON coach_overrides(user_id, date DESC);
CREATE INDEX idx_coach_overrides_user_sport_date ON coach_overrides(user_id, sport_type, date DESC);
CREATE INDEX idx_coach_overrides_user_advice ON coach_overrides(user_id, coach_advice);

ALTER TABLE coach_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own coach overrides" ON coach_overrides
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 3: Coach bias tracking — PER SPORT
-- Stores learned adjustments from coach override patterns
-- Sport-specific so Running, Cycling, Strength learn independently
-- Updated by coaching-learn.ts logic

CREATE TABLE IF NOT EXISTS coach_bias_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport_type TEXT NOT NULL,             -- 'running', 'cycling', 'strength', 'swimming' — empty string '' = global

  -- Adjustment parameters (safety-bounded: -0.10 to +0.10)
  bias_adjustment NUMERIC(4,3),         -- applied to readiness scores
  conservativeness_adjustment NUMERIC(4,3), -- affects recommendation thresholds

  -- Confidence in this adjustment
  confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('low', 'medium', 'high')),
  confidence_reason TEXT,               -- e.g. "Only 3 data points", "Consistent for 30 days", "High behavior variance"

  -- When this was calculated
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata about decision
  reason TEXT,                          -- e.g. "Running: User overrides Rest 6+ times with About Right feedback"
  data_points_count INTEGER,            -- how many overrides this is based on
  override_count_matching_feedback INTEGER, -- how many had matching positive/negative feedback
  behavior_consistency_pct INTEGER,     -- 0-100, how consistent the override pattern is

  CONSTRAINT coach_bias_unique_per_sport UNIQUE (user_id, sport_type)
);

CREATE INDEX idx_coach_bias_user_sport ON coach_bias_adjustments(user_id, sport_type);
CREATE INDEX idx_coach_bias_user ON coach_bias_adjustments(user_id);

ALTER TABLE coach_bias_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own coach bias" ON coach_bias_adjustments
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
