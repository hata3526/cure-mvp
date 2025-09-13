# Repository Guidelines

## Project Structure & Module Organization
- App: `src/` — React + TypeScript.
  - Components: `src/components/**` (PascalCase files, focused, reusable UI).
  - Routes: `src/routes/*.tsx` (page views like `dashboard.tsx`, `review.tsx`).
  - Lib: `src/lib/**` (Supabase client, queries), types in `src/types.ts`.
- Static: `public/` (served as-is), global styles in `src/index.css`.
- Build output: `dist/`.
- Backend (Edge Functions): `supabase/functions/**` (Deno TypeScript).

## Build, Test, and Development Commands
- `pnpm dev` — start Vite dev server.
- `pnpm build` — type-check (`tsc -b`) and build for production into `dist/`.
- `pnpm preview` — preview the production build locally.
- `pnpm lint` — run ESLint over the repo.
(Use npm/yarn equivalents if preferred.)

## Coding Style & Naming Conventions
- Language: TypeScript, ES modules.
- Components: PascalCase (`ExportCsv.tsx`, `Heatmap.tsx`). Routes: lowercase file names (`review.tsx`).
- Prefer function components + hooks; keep components small and focused.
- Styling: Tailwind CSS; keep class lists readable and co-locate UI primitives under `src/components/ui`.
- Linting: ESLint config in `eslint.config.js` (TS + React Hooks). Fix issues before committing.

## Testing Guidelines
- There is currently no automated test suite. If adding tests, prefer Vitest + React Testing Library.
- Suggested layout: `src/__tests__/**/*.test.ts(x)`; name files after the unit under test.
- Minimum: exercise key flows manually via `pnpm dev` (routes under `src/routes`).

## Commit & Pull Request Guidelines
- Commits: concise, imperative subject (e.g., “Add dashboard heatmap”), scope optional. Group related changes.
- PRs: include a clear description, linked issue (if any), screenshots/GIFs for UI changes, and test/QA notes.
- Keep diffs focused; avoid unrelated refactors in feature/bugfix PRs.

## Security & Configuration Tips
- Environment: Vite vars in `.env`/`.env.local` with `VITE_` prefix (see README).
- Do not commit secrets. Edge Function envs are set in Supabase (`SUPABASE_URL`, `SERVICE_ROLE_KEY`, provider keys).
- Never check in `dist/` or local credentials.
