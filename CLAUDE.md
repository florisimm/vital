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
ANTHROPIC_API_KEY=...    # Required for /api/scan-food
```

## Architecture

This is a **Next.js 15 App Router** mobile-first web app (PWA feel) named "Vital" — an AI fitness & health coaching app. It mirrors a companion Swift iOS app in design language.

### Data flow

**`DataProvider`** ([components/DataProvider.tsx](components/DataProvider.tsx)) is a client component mounted in the root layout that fires all Supabase queries in parallel on first render and populates the **SWR cache** for every tab. Pages use `useSWR` with named keys (`'food-log'`, `'training'`, `'health-gezondheid'`, etc.) — the data is usually already warm when the user navigates. Individual pages have their own fetcher functions as fallback.

### Supabase client usage

- **Client components**: `createClient()` from [lib/supabase.ts](lib/supabase.ts) — uses `createBrowserClient`
- **Server components / route handlers**: `createServerSupabaseClient()` from [lib/supabase-server.ts](lib/supabase-server.ts) — uses `createServerClient` with cookie store

### Key database tables

| Table | Purpose |
|---|---|
| `food_log` | Daily food entries per user, keyed by `user_id` + `date` |
| `products` | Food product database (shared + per-user rows via `user_id IS NULL`) |
| `meal_templates` | Saved meal templates with a `foods` JSONB array |
| `user_settings` | Per-user macro targets (`macro_kcal`, `macro_protein`, `macro_carbs`, `macro_fat`) |
| `strava_activities` | Synced Strava workout data |
| `hevy_workouts` | Synced Hevy strength training data |
| `gezondheid` | Daily health metrics (steps `stappen`, weight `gewicht`) |
| `weather_cache` | Single row `id='current'` with current weather |

### UI system

All screens use **`PremiumScreen`** ([components/PremiumScreen.tsx](components/PremiumScreen.tsx)) as the page wrapper — provides the large title header with `ProfileButton`, safe-area padding, and vertical content gap.

Shared UI primitives in [components/ui.tsx](components/ui.tsx): `Card`, `SectionHeader`, `MetricTile`, `MetricRow`, `BigMetricCard`, `NutritionProgressBar`, `CoachRecommendation`, `CategoryStrip`, `SuggestionCard`. Font sizes and colors in these components are intentionally matched to Swift UIKit equivalents (documented in comments).

### Design tokens

- Background: `radial-gradient` teal/orange on `rgb(5, 6, 8)` — set as a fixed full-screen div in the root layout
- Glass cards: `rgba(255,255,255,0.075)` bg, `border-white/[0.09]`
- Teal accent: `rgb(45,212,191)` / `text-teal-400`
- Orange accent: `text-orange-400`
- All text is white on dark; secondary text is `text-white/50`

### Navigation

`BottomNav` ([components/BottomNav.tsx](components/BottomNav.tsx)) is a floating pill-shaped tab bar with 5 tabs: Today (`/`), Coach (`/coach`), Training (`/training`), Health (`/health`), Food (`/food`).

### AI feature

`/api/scan-food` ([app/api/scan-food/route.ts](app/api/scan-food/route.ts)) accepts a base64 image and calls Claude Haiku via the Anthropic SDK to identify the food and return macro estimates as JSON.

### Auth

Supabase Auth with OAuth callback at `/auth/callback`. The login page is at `/login`.
