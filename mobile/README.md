# Kern — Mobile (React Native)

React Native port of the Kern web app, built with **Expo** + **Expo Router** +
**TypeScript**. This directory is a **setup scaffold only** — the web app under
the repo root is the source of truth and has **not** been rewritten yet. See
[MIGRATION.md](./MIGRATION.md) for the porting plan.

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
├── app/                 # Expo Router routes (mirrors web app/ tree)
│   ├── _layout.tsx      # root layout — global providers
│   └── index.tsx        # placeholder landing screen
├── src/
│   ├── lib/             # shared logic (supabase client, etc.)
│   └── components/      # shared UI primitives (to be ported)
├── assets/              # icons & splash
├── app.json            # Expo config
└── .env.example        # EXPO_PUBLIC_* env vars
```

## Not done yet

- No screens are ported — `app/index.tsx` is a placeholder.
- Icons/splash in `assets/` are placeholders and need real artwork.
- API routes (`app/api/*` in the web app) stay server-side; the mobile app
  will call them over HTTPS or hit Supabase / edge functions directly.
