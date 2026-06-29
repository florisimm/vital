# Web → React Native migration plan

This is the roadmap for porting the Kern Next.js web app (repo root) to React
Native (this `mobile/` directory). **Nothing is ported yet** — this scaffold
only establishes the project so migration can happen incrementally without
touching the live website.

## Guiding principles

1. **Don't break the web app.** All work stays inside `mobile/`. The Next.js app
   at the repo root keeps shipping to Vercel unchanged.
2. **Reuse pure logic.** Files in the root `lib/` that have no DOM/Next
   dependency (algorithms, types, formatters) can be copied or shared as-is.
3. **Port screen-by-screen**, starting with the simplest tabs, behind a working
   navigation shell.

## Route mapping (Next.js App Router → Expo Router)

| Web route | Mobile route | Notes |
|---|---|---|
| `app/page.tsx` (Today) | `app/(tabs)/index.tsx` | main tab |
| `app/coach` | `app/(tabs)/coach.tsx` | AI chat |
| `app/training` | `app/(tabs)/training/index.tsx` | + nested running/cycling/swimming/strength/history/performance/session |
| `app/health` | `app/(tabs)/health/index.tsx` | + nested sleep/recovery/heart/weight/activity |
| `app/food` | `app/(tabs)/food/index.tsx` | + scan / meal sheets |
| `app/login`, `app/auth/*` | `app/(auth)/*` | Supabase auth via deep links |
| `app/schedule` | `app/schedule.tsx` | placeholder |

`BottomNav` (web) → an Expo Router `(tabs)/_layout.tsx` `Tabs` navigator with
the same 5 tabs: Today / Coach / Training / Health / Food.

## API & data layer

| Web mechanism | Mobile approach |
|---|---|
| `lib/supabase.ts` (browser cookies) | `src/lib/supabase.ts` (AsyncStorage) — done |
| `lib/supabase-server.ts` (cookie store) | N/A — no server components on device |
| `app/api/*` route handlers | Keep deployed server-side; call over HTTPS, or hit Supabase / edge functions directly |
| `DataProvider` + SWR prefetch | Reuse SWR; replace `DataProvider` with a native provider that prefetches the same keys |
| Supabase Realtime | Works in RN with the same `supabase-js` channel API |

## Component translation

| Web | React Native |
|---|---|
| `div` / Tailwind classes | `View` + `StyleSheet` (or NativeWind for Tailwind syntax) |
| `lucide-react` | `lucide-react-native` |
| Leaflet / react-leaflet map | `react-native-maps` |
| `@zxing/browser` barcode scanner | `expo-camera` barcode scanning |
| `radial-gradient` background | `expo-linear-gradient` |
| OG image route (`app/og`) | N/A on device |

## Suggested order

1. **Shell**: `(tabs)/_layout.tsx` tab bar + auth gate + Supabase session.
2. **Shared logic**: copy DOM-free helpers from root `lib/` into `src/lib/`.
3. **UI primitives**: port `components/ui.tsx` (Card, MetricTile, etc.).
4. **Today tab** (simplest read-mostly screen) end-to-end as the template.
5. Health → Training → Food → Coach, reusing the established patterns.
6. Native integrations: camera scanning, push, deep-link OAuth.

## Open decisions

- **Styling**: plain `StyleSheet` vs **NativeWind** (Tailwind-in-RN). NativeWind
  keeps the existing class-based design tokens close to the web source.
- **Maps provider**: `react-native-maps` (Google/Apple) vs an OSM-based lib to
  match the current OpenRouteService/Leaflet stack.
