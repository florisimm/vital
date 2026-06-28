# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js App Router project. Route pages and API handlers live in `app/`, with feature folders such as `app/food`, `app/training`, `app/health`, and `app/api`. Shared UI components live in `components/`, while reusable business logic, Supabase clients, algorithms, and types live in `lib/`. Static assets are in `public/`. Database changes are stored as SQL files in `migrations/`. One-off maintenance and import utilities are in `scripts/`. Generated analysis output in `graphify-out/` should not be treated as application source.

## Build, Test, and Development Commands

Run `npm install` after cloning or when `package-lock.json` changes.

- `npm run dev`: start the local Next.js development server.
- `npm run build`: create a production build and catch TypeScript/Next.js build issues.
- `npm run start`: serve the production build locally after `npm run build`.
- `npm run import:fooddata`: run `scripts/import-fooddata-central.mjs` to import food data.
- `node scripts/verify-workout-matching.mjs`: run the workout matching verification script.

There is currently no project-wide `npm test` script.

## Coding Style & Naming Conventions

Use TypeScript with strict checking enabled. Prefer `.tsx` for React components and `.ts` for non-UI modules. Follow existing formatting: two-space indentation, semicolons where already used, named exports for shared helpers, and descriptive camelCase function names. React components use PascalCase, for example `TrainingDetailScreen.tsx`. Keep route files named according to Next.js conventions: `page.tsx`, `layout.tsx`, `route.ts`, and `loading.tsx`.

## Testing Guidelines

Add focused tests or verification scripts when changing algorithms or data transformations. Place reusable logic in `lib/` so it can be tested outside UI code. For workout matching changes, run `node scripts/verify-workout-matching.mjs`. For broader changes, run `npm run build` before opening a PR.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries, sometimes with a conventional prefix, for example `fix: always sync Hevy on Today page visit` or `Improve coach chat input box`. Keep commits focused on one change.

Pull requests should include a concise description, verification steps, linked issues when applicable, and screenshots or screen recordings for UI changes. Call out database migrations, environment variable changes, and any manual deployment steps.

## Security & Configuration Tips

Do not commit secrets. Use `.env.local` for local credentials and `.env.local.example` as the public template. Review `middleware.ts`, `lib/server-security.ts`, Supabase access patterns, and SQL migrations carefully when changing authentication, row-level security, or API routes.
