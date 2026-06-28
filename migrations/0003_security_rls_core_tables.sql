-- Idempotent RLS baseline for user-owned application tables.
-- This keeps the expected Supabase protections versioned with the app.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'alarm_log',
    'api_keys',
    'body_measurements',
    'calendar_events',
    'coach_bias_adjustments',
    'coach_overrides',
    'error_logs',
    'fitbit_tokens',
    'food_log',
    'gezondheid',
    'google_calendar_tokens',
    'google_tokens',
    'hevy_workouts',
    'meal_templates',
    'scheduled_alarms',
    'session_feedback',
    'session_ratings',
    'shortcut_tokens',
    'strava_activities',
    'strava_tokens',
    'supplements',
    'training_preferences',
    'user_settings'
  ]
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'own rows select'
      ) THEN
        EXECUTE format('CREATE POLICY "own rows select" ON public.%I FOR SELECT USING (auth.uid() = user_id)', tbl);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'own rows insert'
      ) THEN
        EXECUTE format('CREATE POLICY "own rows insert" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', tbl);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'own rows update'
      ) THEN
        EXECUTE format('CREATE POLICY "own rows update" ON public.%I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', tbl);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'own rows delete'
      ) THEN
        EXECUTE format('CREATE POLICY "own rows delete" ON public.%I FOR DELETE USING (auth.uid() = user_id)', tbl);
      END IF;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products own or shared select'
    ) THEN
      CREATE POLICY "products own or shared select"
      ON public.products FOR SELECT
      USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products own insert'
    ) THEN
      CREATE POLICY "products own insert"
      ON public.products FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products own update'
    ) THEN
      CREATE POLICY "products own update"
      ON public.products FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products own delete'
    ) THEN
      CREATE POLICY "products own delete"
      ON public.products FOR DELETE
      USING (auth.uid() = user_id);
    END IF;
  END IF;
END $$;
