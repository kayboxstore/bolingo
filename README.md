# Bolingo

Dating app — **Next.js (App Router) · TypeScript · Tailwind CSS · Supabase**.

## Quick start

```bash
npm install
cp .env.example .env.local     # add your Supabase URL + anon key
npm run dev                    # http://localhost:3000
```

## Database

The schema (`supabase/migrations/0001_init.sql`) needs the `postgis` and `pgcrypto` extensions.

```bash
supabase db push               # apply migrations to the linked project
# or paste the migration into the Supabase SQL editor
```

Highlights (see migration + `CLAUDE.md` for details): PostGIS distance matching, a race-safe auto-match
trigger, Row Level Security on every table, soft-delete accounts, per-photo moderation, and dedicated
`blocks` / `match_reads` tables.

## Scripts

| command | description |
| --- | --- |
| `npm run dev` | start the dev server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Next.js ESLint |
