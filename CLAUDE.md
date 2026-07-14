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

### Design decisions on top of the charte v1.0 (proposed for v1.1)

- **Heading scale mapping**: full-page hero → `text-h1`; section pages → `text-h2`; titles inside the
  448px auth card → `text-h3`.
- **`error` token `#B3261E`**: the charte defines no error color. Rose vif fails AA as text and CTA rose
  reads as a link; errors use the dedicated `text-error` token instead. `text-brand` is for links/CTAs only.
- **Secondary (ghost) button** (`border-ink/15 text-ink`): approved variant, e.g. "Se connecter" on the landing.
- **Buttons are set in Poppins SemiBold** (`font-display font-semibold`), matching the charte comps.
- Muted text on white: use `ink/60` minimum for legend-size (13px), `ink/70` preferred; `ink/40` only for
  genuinely disabled controls (WCAG exemption).

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
- **Auth session cookies are `httpOnly`** (+ `secure` in prod, `sameSite=lax`): all auth flows go through
  Server Actions / Route Handlers. `lib/supabase/client.ts` is therefore **anonymous-only** in the browser —
  revisit the cookie strategy before any client-side session need (Realtime…).
- `NEXT_PUBLIC_SITE_URL` is **required in production** (email links); the `Origin`-header fallback is dev-only.
- **Accepted trade-off (documented, spec-mandated)**: a login with *valid* credentials on an unverified
  account redirects to `/verify-email` — this implicitly confirms account+password validity for the
  unconfirmed window. Standard IdP behavior; the window closes at first confirmation.
- Anti-enumeration everywhere else: signup/forgot-password/resend return identical generic responses whether
  the account exists or not; login errors are generic.
- Rate limiting relies on Supabase Auth built-in limits (mapped to clear FR messages). If abuse appears,
  add a per-IP/email throttle (KV) in front of signUp/forgotPassword/resendVerification.
