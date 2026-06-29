# Kern — Mobile (React Native)

React Native port of the Kern web app, built with **Expo** + **Expo Router** +
**TypeScript**. The web app under the repo root is the source of truth and is
**not** being rewritten. See [MIGRATION.md](./MIGRATION.md) for the porting plan.

## Why Expo + Expo Router

- **Expo Router** is file-based routing that maps almost 1:1 onto the existing
  Next.js App Router (`app/` directory, layouts, nested routes), so the porting
  effort is mostly translating React DOM/Tailwind to React Native primitives,
  not re-architecting navigation.
- **Expo** gives us OTA updates, EAS Build, and managed native modules
  (camera for barcode scanning, secure storage for tokens, etc.).

## Getting started

```bash
cd mobile
npm install
cp .env.example .env   # fill in Supabase URL + anon key
npm run start          # then press i (iOS), a (Android), or w (web)
```

> The `package.json` here pins Expo SDK 52. If you scaffold fresh with
> `npx create-expo-app`, reconcile versions with `npx expo install --fix`.

## Structure

```
mobile/
  app/
    _layout.tsx          root layout — gradient Background + providers
    (tabs)/
      _layout.tsx        Tabs navigator + floating BottomNav + ProfileButton
      index.tsx          Today    (placeholder content)
      coach.tsx          Coach    (placeholder content)
      training.tsx       Training (placeholder content)
      health.tsx         Health   (placeholder content)
      food.tsx           Food     (placeholder content)
  src/
    lib/                 supabase client, services, theme tokens
    components/          Background, BottomNav, ProfileButton, ui, TabScreen
  assets/                icons & splash (placeholders)
  app.json              Expo config
  .env.example           EXPO_PUBLIC_* env vars
```

## Already working

- **Background** — gradient (teal top-right / orange bottom-left over dark),
  matching the web design tokens.
- **Bottom menu** — floating pill tab bar with the 5 tabs, fully navigable
  (wired into Expo Router `Tabs` as a custom `tabBar`).
- **Profile button** — top-right circle; opens a full-screen profile page wired
  to Supabase: edit name, units toggle, step goal + strength references, manual
  macro targets, device connections (Strava / Hevy / Google Calendar /
  Google Health), and sign out.

## Not done yet

- Tab **screen content** (Today/Coach/Training/Health/Food) is placeholder.
- The most complex profile flows from web (multi-step macro calculator,
  training-zone drag editor, account email/password/delete) are summarized.
- Icons/splash in `assets/` are placeholders and need real artwork.
- API routes (`app/api/*` in the web app) stay server-side; the mobile app
  calls them over HTTPS or hits Supabase / edge functions directly.
