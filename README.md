# Care MVP

Vite + React + TypeScript app with Tailwind CSS, shadcn/ui, React Router v6, React Query, and Supabase JS v2.

## Getting Started

1. Install deps

```bash
pnpm i
```

2. Configure env

Create `.env` and set:

```
VITE_SUPABASE_URL=your-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

3. Dev server

```bash
pnpm dev
```

## Tech

- Vite + React + TypeScript
- Tailwind CSS + minimal shadcn/ui primitives
- React Router v6, React Query (@tanstack)
- Supabase JS v2 (DB + Edge Functions)

## Tailwind + shadcn setup

- `tailwind.config.ts`, `postcss.config.js` present
- `src/index.css` includes `@tailwind base; @tailwind components; @tailwind utilities;`
- UI primitives under `src/components/ui/` (Button, Card, Dialog, Input, Select, Label, Checkbox)

## Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Data Model

See `src/types.ts` and queries in `src/lib/queries.ts`.

## Supabase Edge Functions

- POST `/functions/v1/ingest-ocr` { storagePath }
- POST `/functions/v1/parse-structure` { sourceDocId }

The UI triggers these via Supabase client `.functions.invoke()`.

## Usage Flow

1. Review → Ingest OCR → Parse → Review grid
2. Edit cells and Save → Upsert `care_events`
3. Dashboard shows totals and heatmap
4. Export CSV reflects current date filter
