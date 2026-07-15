-- ============================================================================
-- Bolingo — initial schema
-- Implements the database-architect audit (blockers + important findings):
--   * PostGIS geography + GiST for distance matching
--   * race-safe, idempotent auto-match trigger (SECURITY DEFINER, pinned path)
--   * RLS on every table (no pass-leak on likes; reported user can't see reports)
--   * soft-delete + GDPR-safe cascades (reports survive user deletion)
--   * profile_photos (per-photo moderation/ordering), blocks, match_reads
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists postgis;

-- ============================== ENUMS =======================================
create type gender         as enum ('woman','man','non_binary','other');
create type orientation    as enum ('straight','gay','lesbian','bisexual','pansexual','other');
create type like_type      as enum ('like','pass','superlike');
create type match_status   as enum ('active','unmatched');   -- blocking lives in `blocks`
create type report_status  as enum ('open','reviewing','resolved','dismissed');
create type report_category as enum ('spam','harassment','inappropriate_content','fake_profile','underage','other');
create type account_status as enum ('active','suspended','deleted');
create type moderation_status as enum ('pending','approved','rejected');

-- ============================== HELPERS =====================================
-- updated_at auto-touch
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================== USERS =======================================
-- Account/security state. 1:1 with auth.users. NOT readable by other members.
create table public.users (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text unique,
  phone          text unique,
  status         account_status not null default 'active',
  is_admin       boolean not null default false,
  last_active_at timestamptz,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- admin check helper (STABLE, definer) used by RLS policies
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select u.is_admin from public.users u where u.id = uid), false);
$$;

-- ============================== PROFILES ====================================
create table public.profiles (
  user_id        uuid primary key references public.users(id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 1 and 50),
  birthdate      date not null check (birthdate <= (current_date - interval '18 years')),
  gender         gender not null,
  orientation    orientation,
  bio            text check (bio is null or char_length(bio) <= 500),
  city           text,
  location       geography(Point, 4326),                 -- lon/lat; ST_DWithin-friendly
  interested_in  gender[] not null default '{}',
  age_min        int not null default 18 check (age_min >= 18),
  age_max        int not null default 99 check (age_max >= age_min),
  max_distance_km int not null default 50 check (max_distance_km between 1 and 20000),
  primary_photo_path text,                               -- denormalized for feed cards
  is_visible     boolean not null default true,
  onboarding_completed_at timestamptz,                   -- empty profiles excluded from feed
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create index profiles_location_gix on public.profiles using gist (location);
create index profiles_feed_idx on public.profiles (gender, birthdate) where is_visible;
create index profiles_interested_in_gin on public.profiles using gin (interested_in);

-- ============================== PROFILE PHOTOS ==============================
create table public.profile_photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  storage_path  text not null,                           -- Supabase Storage object key
  position      smallint not null check (position between 0 and 5),
  moderation_status moderation_status not null default 'pending',
  nsfw_score    real,
  created_at    timestamptz not null default now(),
  unique (user_id, position)
);
create index profile_photos_user_idx on public.profile_photos (user_id);

-- ============================== LIKES =======================================
create table public.likes (
  id         uuid primary key default gen_random_uuid(),
  liker_id   uuid not null references public.users(id) on delete cascade,
  likee_id   uuid not null references public.users(id) on delete cascade,
  type       like_type not null default 'like',
  created_at timestamptz not null default now(),
  constraint likes_no_self check (liker_id <> likee_id),
  constraint likes_unique_pair unique (liker_id, likee_id)
);
-- "who liked me" lookup (positive only)
create index likes_incoming_idx on public.likes (likee_id) where type in ('like','superlike');
-- feed anti-join: "everyone I've already acted on"
create index likes_outgoing_idx on public.likes (liker_id, likee_id);

-- ============================== MATCHES =====================================
create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.users(id) on delete cascade,
  user_b     uuid not null references public.users(id) on delete cascade,
  status     match_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_ordered check (user_a < user_b),
  constraint matches_unique_pair unique (user_a, user_b)
);
create trigger matches_updated_at before update on public.matches
  for each row execute function public.set_updated_at();
create index matches_user_a_idx on public.matches (user_a);
create index matches_user_b_idx on public.matches (user_b);

-- per-participant read state (replaces per-message status)
create table public.match_reads (
  match_id     uuid not null references public.matches(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

-- ============================== MESSAGES ====================================
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches(id) on delete cascade,
  sender_id  uuid not null references public.users(id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
-- keyset pagination: (match_id, created_at desc, id desc)
create index messages_keyset_idx on public.messages (match_id, created_at desc, id desc);

-- ============================== BLOCKS ======================================
-- Directional row; visibility effect is mutual (enforced in feed + RLS).
create table public.blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_no_self check (blocker_id <> blocked_id),
  constraint blocks_unique_pair unique (blocker_id, blocked_id)
);
create index blocks_blocker_idx on public.blocks (blocker_id);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- "is there a block in either direction between a and b?"
create or replace function public.blocks_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- ============================== REPORTS =====================================
create table public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid references public.users(id) on delete set null,
  reported_id    uuid references public.users(id) on delete set null,
  reported_handle text,                                  -- snapshot: survives user deletion
  category       report_category not null default 'other',
  reason         text not null,
  details        text,
  message_id     uuid references public.messages(id) on delete set null,  -- evidence
  status         report_status not null default 'open',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint reports_no_self check (reporter_id is null or reported_id is null or reporter_id <> reported_id)
);
create trigger reports_updated_at before update on public.reports
  for each row execute function public.set_updated_at();
create index reports_reported_idx on public.reports (reported_id);
create index reports_open_idx on public.reports (status) where status in ('open','reviewing');

-- ============================== TRIGGERS ====================================
-- Auto-create the account row (and nothing else) on signup. The dating profile
-- is created by the user during onboarding (profiles has required columns).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, phone)
  values (new.id, new.email, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Idempotent, race-safe auto-match on mutual positive like.
create or replace function public.handle_new_like()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a uuid;
  b uuid;
begin
  if new.type not in ('like','superlike') then
    return new;
  end if;

  -- reciprocal positive like present?
  if exists (
    select 1 from public.likes l
    where l.liker_id = new.likee_id
      and l.likee_id = new.liker_id
      and l.type in ('like','superlike')
  ) then
    a := least(new.liker_id, new.likee_id);
    b := greatest(new.liker_id, new.likee_id);
    insert into public.matches (user_a, user_b)
    values (a, b)
    on conflict (user_a, user_b) do nothing;   -- double-fire safe
  end if;

  return new;
end;
$$;
create trigger on_like_created
  after insert on public.likes
  for each row execute function public.handle_new_like();

-- ============================== RLS =========================================
alter table public.users          enable row level security;
alter table public.profiles       enable row level security;
alter table public.profile_photos enable row level security;
alter table public.likes          enable row level security;
alter table public.matches        enable row level security;
alter table public.match_reads    enable row level security;
alter table public.messages       enable row level security;
alter table public.blocks         enable row level security;
alter table public.reports        enable row level security;

-- ---- users: only self (and admins) may read; self may not escalate ---------
create policy users_select_self on public.users
  for select using (auth.uid() = id or public.is_admin(auth.uid()));
create policy users_update_self on public.users
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_admin = (select u.is_admin from public.users u where u.id = auth.uid())
    and status   = (select u.status   from public.users u where u.id = auth.uid())
  );

-- ---- profiles: read visible, active, non-blocked; write only own -----------
create policy profiles_select on public.profiles
  for select using (
    auth.uid() = user_id
    or (
      is_visible
      and deleted_at is null
      and onboarding_completed_at is not null
      and not public.blocks_between(auth.uid(), user_id)
      and exists (select 1 from public.users u where u.id = user_id and u.status = 'active')
    )
  );
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = user_id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- profile_photos: owner manages; approved photos visible with the profile
create policy photos_select on public.profile_photos
  for select using (
    auth.uid() = user_id
    or (moderation_status = 'approved' and not public.blocks_between(auth.uid(), user_id))
  );
create policy photos_write_own on public.profile_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- likes: never leak `pass`; see own outgoing + positive incoming --------
create policy likes_select on public.likes
  for select using (
    auth.uid() = liker_id
    or (auth.uid() = likee_id and type in ('like','superlike'))
  );
create policy likes_insert_own on public.likes
  for insert with check (
    auth.uid() = liker_id
    and liker_id <> likee_id
    and not public.blocks_between(liker_id, likee_id)
  );
create policy likes_delete_own on public.likes
  for delete using (auth.uid() = liker_id);   -- undo

-- ---- matches: participants read; created by trigger only; unmatch only -----
create policy matches_select on public.matches
  for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy matches_update_participant on public.matches
  for update using (auth.uid() = user_a or auth.uid() = user_b)
  with check (status = 'unmatched');   -- can only transition to unmatched

-- ---- match_reads: own row within a match you belong to ---------------------
create policy match_reads_own on public.match_reads
  for all using (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  ) with check (auth.uid() = user_id);

-- ---- messages: read/send within an active match you belong to --------------
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and m.status = 'active'
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );
create policy messages_insert on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.status = 'active'
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );
create policy messages_update_own on public.messages
  for update using (auth.uid() = sender_id) with check (auth.uid() = sender_id); -- soft-delete own

-- ---- blocks: only the blocker sees/manages their own blocks ----------------
create policy blocks_own on public.blocks
  for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- ---- reports: reporter reads own; admins read/manage; reported can't see ----
create policy reports_insert_own on public.reports
  for insert with check (auth.uid() = reporter_id and reporter_id <> reported_id);
create policy reports_select on public.reports
  for select using (auth.uid() = reporter_id or public.is_admin(auth.uid()));
create policy reports_update_admin on public.reports
  for update using (public.is_admin(auth.uid()));
