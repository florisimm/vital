# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
NEXT_PUBLIC_ORS_API_KEY=...      # Required for route generation on /training/session
ANTHROPIC_API_KEY=...            # Required for /api/scan-food
```

## Architecture

This is a **Next.js 15 App Router** mobile-first web app (PWA feel) named "Vital" — an AI fitness & health coaching app. It mirrors a companion Swift iOS app in design language.

### Data flow

**`DataProvider`** ([components/DataProvider.tsx](components/DataProvider.tsx)) is a client component mounted in the root layout that fires all Supabase queries in parallel on first render and populates the **SWR cache** for every tab. Pages use `useSWR` with named keys — the data is usually already warm when the user navigates. Individual pages have their own `fetcher.ts` as fallback.

SWR cache keys: `'food-log'`, `'products'`, `'today'`, `'health-gezondheid'`, `'training'`.

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

**Training sub-pages** (`/training/running`, `/training/cycling`, `/training/strength`, `/training/history`) use `TrainingDetailScreen` ([components/TrainingDetailScreen.tsx](components/TrainingDetailScreen.tsx)) — back button + horizontal category strip linking to the four sub-pages.

**Health sub-pages** (`/health/sleep`, `/health/recovery`, etc.) use `HealthDetailScreen` — back button + horizontal category strip linking to health sub-pages.

**Detail / drill-down pages** outside those two patterns use `DetailScreen` (back button + centered title).

**Shared UI primitives** in [components/ui.tsx](components/ui.tsx): `Card`, `SectionHeader`, `MetricTile`, `MetricRow`, `BigMetricCard`, `NutritionProgressBar`, `CoachRecommendation`, `CategoryStrip`, `SuggestionCard`, `MinimalWorkoutList`. Font sizes in these components are intentionally matched to Swift UIKit equivalents (documented in inline comments).

### Training session page

`/training/session` ([app/training/session/page.tsx](app/training/session/page.tsx)) receives `?title=` and `?time=` query params (linked from calendar events). It:
1. Detects sport type from the event title via keyword matching
2. Fetches the user's last 60 days of `strava_activities` client-side
3. Runs a pure-JS algorithm to compute training advice (type, duration, pace/speed, zone) based on the user's historical performance
4. Renders a route map using **OpenRouteService** (round-trip or A→B routing) + **Leaflet** for the map

`RouteMap` ([app/training/session/RouteMap.tsx](app/training/session/RouteMap.tsx)) wraps `react-leaflet` and **must always be dynamically imported with `ssr: false`** — Leaflet requires a browser DOM.

External API calls in the session page (all client-side, no proxy):
- `https://api.openrouteservice.org` — route generation using `NEXT_PUBLIC_ORS_API_KEY`
- `https://nominatim.openstreetmap.org` — geocoding for manual location input

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

### Food meal categories

Dutch keys used in `food_log.meal_category` (in order): `ontbijt`, `snack_ochtend`, `lunch`, `snack_middag`, `avondeten`, `snack_avond`, `supps`.

### AI feature

`/api/scan-food` ([app/api/scan-food/route.ts](app/api/scan-food/route.ts)) accepts a base64 image and calls Claude Haiku via the Anthropic SDK to identify the food and return macro estimates as JSON.

### Auth

Supabase Auth with OAuth callback at `/auth/callback`. The login page is at `/login`. `DataProvider` skips prefetching if no authenticated user is found.

### Error logging

`logError(error, component?)` from [lib/logError.ts](lib/logError.ts) writes to the `error_logs` Supabase table and silently no-ops on failure — safe to call anywhere without try/catch.
