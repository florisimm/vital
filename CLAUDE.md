# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git workflow

Always push to **both** the feature branch and `main`:

```bash
git push -u origin <feature-branch>
git push origin <feature-branch>:main
```

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
```

No lint or test scripts are configured.

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ORS_API_KEY=...                  # Required for route generation on /training/session (server-only, never NEXT_PUBLIC)
NEXT_PUBLIC_SITE_URL=...         # Used for OG metadata base URL and Google OAuth redirect URI
GOOGLE_CLIENT_ID=...             # From Google Cloud Console (OAuth 2.0 client) — server-only
GOOGLE_CLIENT_SECRET=...         # From Google Cloud Console (OAuth 2.0 client) — server-only
```

## Architecture

This is a **Next.js 15 App Router** mobile-first web app (PWA feel) named "Kern" — an AI fitness & health coaching app. It mirrors a companion Swift iOS app in design language.

### Data flow

**`DataProvider`** ([components/DataProvider.tsx](components/DataProvider.tsx)) is a client component mounted in the root layout that fires all Supabase queries in parallel on first render and populates the **SWR cache** for every tab. Pages use `useSWR` with named keys — the data is usually already warm when the user navigates. Individual pages have their own `fetcher.ts` as fallback.

SWR cache keys: `'food-log'` (DataProvider prefetch for today), `'products'`, `'today'`, `'health-gezondheid'`, `'training'`. Note: `FoodClient` uses date-parameterized keys `food-log-${date}` for per-day fetching.

### Supabase client usage

- **Client components**: `createClient()` from [lib/supabase.ts](lib/supabase.ts) — uses `createBrowserClient`
- **Server components / route handlers**: `createServerSupabaseClient()` from [lib/supabase-server.ts](lib/supabase-server.ts) — uses `createServerClient` with cookie store

### Key database tables

| Table | Purpose |
|---|---|
| `food_log` | Daily food entries per user, keyed by `user_id` + `date` |
| `products` | Food product database (shared + per-user rows via `user_id IS NULL`) |
| `meal_templates` | Saved meal templates with a `foods` JSONB array |
| `user_settings` | Per-user macro targets and `units` (`metric`/`imperial`) |
| `strava_activities` | Synced Strava workout data |
| `strava_tokens` | OAuth tokens for Strava per user |
| `hevy_workouts` | Synced Hevy strength training data |
| `gezondheid` | Daily health metrics (steps `stappen`, weight `gewicht`) |
| `weather_cache` | Single row `id='current'` with current weather |
| `calendar_events` | Training schedule events, filtered to upcoming sport events in Training tab |
| `google_tokens` | OAuth tokens for Google Calendar per user |
| `error_logs` | Written to by `logError()` — never read by the app |

### Page & component conventions

**Main tab pages** use `PremiumScreen` (large title header + `ProfileButton` + safe-area padding). Complex tabs split content into a co-located `sections.tsx` (client components, shared types, helpers) and a `fetcher.ts` (Supabase query for that tab).

**Training sub-pages** (`/training/running`, `/training/cycling`, `/training/swimming`, `/training/strength`, `/training/history`, `/training/performance`) use `TrainingDetailScreen` ([components/TrainingDetailScreen.tsx](components/TrainingDetailScreen.tsx)) — back button + horizontal category strip. `training/sections.tsx` exports the `Activity` and `HevyWorkout` types plus shared helpers (`formatDuration`, `formatPace`, `formatDate`, `sportIcon`, `startOfWeek`).

**Health sub-pages** (`/health/sleep`, `/health/recovery`, `/health/heart`, `/health/weight`, `/health/activity`) use `HealthDetailScreen` — back button + horizontal category strip. `health/sections.tsx` exports `GezondheidsRow` and shared health UI components.

**Detail / drill-down pages** outside those two patterns use `DetailScreen` (back button + centered title).

**Shared UI primitives** in [components/ui.tsx](components/ui.tsx): `Card`, `SectionHeader`, `MetricTile`, `MetricRow`, `BigMetricCard`, `NutritionProgressBar`, `CoachRecommendation`, `CategoryStrip`, `SuggestionCard`, `MinimalWorkoutList`. Font sizes in these components are intentionally matched to Swift UIKit equivalents (documented in inline comments).

### Training session page

`/training/session` ([app/training/session/page.tsx](app/training/session/page.tsx)) receives `?title=` and `?time=` query params (linked from calendar events). It:
1. Detects sport type from the event title via keyword matching
2. Fetches the user's last 60 days of `strava_activities` client-side
3. Runs a pure-JS algorithm to compute training advice (type, duration, pace/speed, zone) based on the user's historical performance
4. Renders a route map using **OpenRouteService** (round-trip or A→B routing) + **Leaflet** for the map

`RouteMap` ([app/training/session/RouteMap.tsx](app/training/session/RouteMap.tsx)) wraps `react-leaflet` and **must always be dynamically imported with `ssr: false`** — Leaflet requires a browser DOM.

External API calls in the session page:
- `/api/route-plan` — server-side proxy to `https://api.openrouteservice.org` using `ORS_API_KEY` (key never exposed to browser)
- `https://nominatim.openstreetmap.org` — geocoding for manual location input (client-side, no key required)

### Supabase Edge Functions

Called directly from client components using the Supabase URL:
- `{SUPABASE_URL}/functions/v1/google-calendar-auth?user_id=` — initiates Google Calendar OAuth
- `{SUPABASE_URL}/functions/v1/google-calendar-sync` — syncs calendar events (POST with Bearer token)

### Design tokens

- Background: `radial-gradient` teal/orange on `rgb(5, 6, 8)` — fixed full-screen div in root layout
- Glass cards: `rgba(255,255,255,0.075)` bg, `border-white/[0.09]`
- Teal accent: `rgb(45,212,191)` / `text-teal-400`
- Orange accent: `text-orange-400`
- Secondary text: `text-white/50`

### Navigation

`BottomNav` ([components/BottomNav.tsx](components/BottomNav.tsx)) is a floating pill-shaped tab bar with 5 tabs: Today (`/`), Coach (`/coach`), Training (`/training`), Health (`/health`), Food (`/food`). It hides (`display: none`) when `ProfileButton` is open — controlled via `data-bottom-nav` attribute.

`ProfileButton` ([components/ProfileButton.tsx](components/ProfileButton.tsx)) is the settings hub mounted in every `PremiumScreen`. It manages: metric/imperial units, step goal, strength reference lifts (squat/bench/deadlift stored in `user_settings`), page visibility toggles (hidden pages stored per user), and OAuth service connections (Strava, Hevy, Google Calendar). Also hides the bottom nav while open.

`/schedule` is a static placeholder page (not linked from BottomNav) — a future AI schedule view.

`BarcodeScanner` ([components/BarcodeScanner.tsx](components/BarcodeScanner.tsx)) uses `@zxing/browser` (dynamically imported) for camera-based barcode scanning; the detected barcode is passed to `/api/barcode-lookup`.

### Food meal categories

Dutch keys used in `food_log.meal_category` (in order): `ontbijt`, `snack_ochtend`, `lunch`, `snack_middag`, `avondeten`, `snack_avond`, `supps`.

### Fitbit integration

Three API routes handle Fitbit Sense 2 connectivity:

- `GET /api/fitbit/connect?user_id=` — redirects to Google OAuth (requires `GOOGLE_CLIENT_ID`)
- `GET /api/fitbit/callback` — exchanges auth code for tokens, stores in `fitbit_tokens`, redirects to `/health?fitbit=connected`
- `POST /api/fitbit/sync` — fetches 7 days of steps, resting HR, HRV, and today's sleep from Fitbit API; upserts into `gezondheid`

`fitbit_tokens` table: `user_id`, `access_token`, `refresh_token`, `expires_at`, `fitbit_user_id`. Tokens are auto-refreshed in the sync route when expired.

`gezondheid` now has additional columns: `hartslag_rust` (resting HR), `hrv_rmssd` (daily RMSSD), `slaap_minuten`, `slaap_score` (efficiency %), `slaap_diep`, `slaap_licht`, `slaap_rem` (minutes per stage). Run this migration if the columns don't exist:

```sql
CREATE TABLE IF NOT EXISTS fitbit_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL, refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, fitbit_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE fitbit_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fitbit tokens" ON fitbit_tokens USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE gezondheid
  ADD COLUMN IF NOT EXISTS hartslag_rust INTEGER,
  ADD COLUMN IF NOT EXISTS hrv_rmssd NUMERIC,
  ADD COLUMN IF NOT EXISTS slaap_minuten INTEGER,
  ADD COLUMN IF NOT EXISTS slaap_score INTEGER,
  ADD COLUMN IF NOT EXISTS slaap_diep INTEGER,
  ADD COLUMN IF NOT EXISTS slaap_licht INTEGER,
  ADD COLUMN IF NOT EXISTS slaap_rem INTEGER;

ALTER TABLE gezondheid ADD CONSTRAINT gezondheid_user_datum_unique UNIQUE (user_id, datum);
```

After connecting, health sub-pages (Sleep, Recovery, Heart) show real data via the `health-gezondheid` SWR key. Connect flow: user taps Fitbit in ProfileButton → Google OAuth → callback → auto-sync → redirect to `/health`. Registered redirect URI in Google Cloud Console must match `{NEXT_PUBLIC_SITE_URL}/api/fitbit/callback`.

### Food scanning

`/api/barcode-lookup` ([app/api/barcode-lookup/route.ts](app/api/barcode-lookup/route.ts)) receives a `?barcode=` query param and:
1. Checks the `products` table first (user's own rows + `user_id IS NULL` shared rows) — returns immediately on cache hit.
2. Falls back to the Open Food Facts API (`https://world.openfoodfacts.org/api/v0/product/{barcode}.json`).
3. Parses the OFN response and saves the product to `products` under the user's `user_id` for future cache hits.
4. Returns a `Product` object (see `lib/types.ts`).

`/api/scan-food` returns 410 Gone — replaced by `/api/barcode-lookup`. The `@anthropic-ai/sdk` package can be removed from `package.json`.

The `products` table has `barcode TEXT` and `image_url TEXT` columns (in addition to the nutritional fields). Run the migration below if they don't exist yet:

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
CREATE INDEX IF NOT EXISTS products_barcode_idx ON products(barcode) WHERE barcode IS NOT NULL;
```

### Food tab structure

`app/food/FoodClient.tsx` is the main orchestrator (date navigation, SWR, sheet state). Components in `app/food/components/`: `AddFoodSheet`, `EditFoodSheet`, `MealSection`, `MacroDrillSheet`, `ScanResultView`, `MealsListView`, `CreateMealView`, `MealConfirmView`, `CustomFoodView`, `ProductDetailView`.

`app/food/meal-config.ts` exports `MEAL_ORDER`, `MEAL_LABELS`, `MEAL_ICONS`, `getMealForHour()`, `formatDayLabel()`, and the `MacroKey` type — import from here when working with meal categories.

### Shared types

`lib/types.ts` exports `FoodLogEntry` and `Product` — import from here rather than redefining locally. `app/food/fetchers.ts` exports all Supabase fetchers for the Food tab (`fetchFoodData`, `fetchProducts`, `fetchMealTemplates`, `fetchFoodFrequency`) plus the local types `Targets`, `MealTemplate`, `TemplateFoodItem`.

`lib/training-algorithm.ts` exports `SportType`, `TrainingType`, `UserLevel`, `Advice`, `ComputeAdviceResult`, and `detectSport(title)` — used by the session page and can be used by any component that needs to classify a workout string.

### Auth

Supabase Auth with OAuth callback at `/auth/callback`. The login page is at `/login`. `DataProvider` skips prefetching if no authenticated user is found.

### Error logging

`logError(error, component?)` from [lib/logError.ts](lib/logError.ts) writes to the `error_logs` Supabase table and silently no-ops on failure — safe to call anywhere without try/catch.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
