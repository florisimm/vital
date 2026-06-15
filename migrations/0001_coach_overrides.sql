-- Adaptive coaching: track when users override advice and session outcomes
-- Enables coach to learn and adjust future recommendations

CREATE TABLE IF NOT EXISTS coach_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  original_advice TEXT NOT NULL,  -- e.g. "Rest Day", "Light Workout", "Zone 2 Run"
  user_action TEXT NOT NULL,      -- e.g. "Skipped", "Light workout", "Hard workout", "Rest"
  session_quality TEXT,           -- null (not evaluated yet), "bad" (fatigued), "good", "excellent"
  session_notes TEXT,             -- optional user notes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coach_overrides_user_date ON coach_overrides(user_id, date DESC);

ALTER TABLE coach_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own coach overrides" ON coach_overrides
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
