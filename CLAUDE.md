# Motema

Dating app. Stack: **Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Auth + Storage)**.

> "Motema" = *heart* in Lingala. Brand assets live at the repo root (`motema-*.png`): logo, charte
> (color/type system), header and profile-card references. Extract the palette from `motema-charte-*.png`
> and replace the placeholder brand tokens in `tailwind.config.ts`.

## Getting started

```bash
npm install
cp .env.example .env.local        # fill in Supabase URL + anon key
npm run dev                       # http://localhost:3000
```

Database: apply `supabase/migrations/*.sql` (via the Supabase CLI `supabase db push`, or paste into the
SQL editor). The schema enables the `postgis` and `pgcrypto` extensions.

## Layout

```
app/                 # App Router routes, layouts, server components
  layout.tsx
  page.tsx
  globals.css
lib/supabase/        # typed Supabase clients (browser / server / middleware)
  client.ts
  server.ts
  middleware.ts
types/database.ts    # DB types (regenerate: supabase gen types typescript)
middleware.ts        # refreshes the auth session cookie on every request
supabase/
  config.toml
  migrations/0001_init.sql
```

## Conventions

- **TypeScript strict**. Path alias `@/*` maps to the repo root.
- **Server-first**: default to Server Components; add `"use client"` only when needed (interactivity, hooks).
- **Never** query Supabase from a client component with the service role key. Browser uses the anon key only;
  privileged work goes through server components / route handlers / RPC.
- **RLS is the security model.** Every `public` table has RLS enabled. Do not rely on client-side checks; if a
  query needs to bypass RLS it belongs in a `SECURITY DEFINER` function with a pinned `search_path`.
- Tailwind for styling; brand tokens (colors, radius, type) centralised in `tailwind.config.ts`.

## Data model (see migration for the source of truth)

`users` (account/security, 1:1 with `auth.users`) · `profiles` (public dating profile, PostGIS `location`) ·
`profile_photos` (per-photo moderation + ordering, Storage paths) · `likes` (like/pass/superlike) ·
`matches` (canonical `user_a < user_b`, created by trigger on mutual like) · `match_reads` (per-participant
`last_read_at`) · `messages` · `blocks` (directional, mutual effect) · `reports` (moderation, with evidence FK).

Key rules baked into the DB:
- Mutual `like`/`superlike` auto-creates a match (idempotent, race-safe via `ON CONFLICT`).
- Account deletion is **soft** (`status='deleted'` + PII scrub); reports about a user survive their deletion.
- `likes` RLS never leaks `pass` rows; a reported user can never read reports about them.

## Security notes

- Secrets only in `.env.local` (gitignored). `.env.example` documents the required vars.
- The `SUPABASE_SERVICE_ROLE_KEY` is server-only — never import it into client code.
