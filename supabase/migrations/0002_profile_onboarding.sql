-- ============================================================================
-- Bolingo — profile onboarding
--   * photo moderation: publish immediately, `flagged` for manual review
--   * wizard progress (onboarding_step) for resume
--   * legal age gate: permanent underage flag, unclearable by the user
--   * DB-enforced onboarding completion integrity (trigger)
--   * private Storage bucket for profile photos + per-user folder policies
-- ============================================================================

-- ---------------------------------------------------------------- moderation
-- No AI pre-moderation for MVP: photos go live immediately ('approved'),
-- `flagged` marks them for manual review; existing RLS keeps only 'approved'
-- photos visible to other users.
alter type moderation_status add value if not exists 'flagged';

alter table public.profile_photos
  alter column moderation_status set default 'approved';

-- ------------------------------------------------------------ wizard resume
-- Last completed wizard step (photos=1 … review pending=5). Step 1 state is
-- derived from the photo count (the profiles row doesn't exist yet then).
alter table public.profiles
  add column if not exists onboarding_step smallint not null default 0
    check (onboarding_step between 0 and 5);

-- --------------------------------------------------------- underage blocking
-- Legal gate: once set, this flag is permanent. Column-level privileges make
-- it (and status/is_admin) unwritable by users, on top of RLS.
alter table public.users
  add column if not exists underage_attempted_at timestamptz;

-- email/phone restent des miroirs d'auth.users (mis à jour par les flux Auth) :
-- les laisser modifiables ouvrirait un oracle d'énumération via la contrainte
-- unique (PATCH de son propre email vers celui d'une victime → 409 si existe).
revoke update on table public.users from authenticated;
revoke update on table public.users from anon;
grant update (last_active_at) on table public.users to authenticated;

-- Helpers SECURITY DEFINER pour les policies (les sous-requêtes inline sur
-- public.users sont étranglées par la RLS users_select_self).
create or replace function public.is_underage_blocked(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u
    where u.id = uid and u.underage_attempted_at is not null
  );
$$;

create or replace function public.user_is_active(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u where u.id = uid and u.status = 'active'
  );
$$;

-- « Profil publiquement visible » — prédicat unique partagé par les policies.
create or replace function public.profile_publicly_visible(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    join public.users u on u.id = p.user_id
    where p.user_id = uid
      and p.is_visible
      and p.deleted_at is null
      and p.onboarding_completed_at is not null
      and u.status = 'active'
  );
$$;

-- Le blocage mineur est porté au NIVEAU RLS/STORAGE, pas seulement dans les
-- server actions : même un appel PostgREST/Storage direct ne peut plus écrire
-- de données de profil après le flag (« aucune donnée collectée »).
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (
    auth.uid() = user_id and not public.is_underage_blocked(auth.uid())
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and not public.is_underage_blocked(auth.uid())
  );

drop policy if exists photos_write_own on public.profile_photos;
create policy photos_write_own on public.profile_photos
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and not public.is_underage_blocked(auth.uid())
  );

-- Les métadonnées photos ne fuient plus pour les profils invisibles /
-- incomplets / supprimés : même prédicat de visibilité que profiles_select.
drop policy if exists photos_select on public.profile_photos;
create policy photos_select on public.profile_photos
  for select using (
    auth.uid() = user_id
    or (
      moderation_status = 'approved'
      and public.profile_publicly_visible(user_id)
      and not public.blocks_between(auth.uid(), user_id)
    )
  );

-- Corrige profiles_select (0001) : sa sous-requête inline sur public.users
-- était toujours fausse pour autrui à cause de la RLS — helper DEFINER.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    auth.uid() = user_id
    or (
      is_visible
      and deleted_at is null
      and onboarding_completed_at is not null
      and not public.blocks_between(auth.uid(), user_id)
      and public.user_is_active(user_id)
    )
  );

-- Records an underage attempt for the CALLER only and scrubs any profile data
-- already collected for that account (photo rows; storage objects are removed
-- by the server action before calling this).
create or replace function public.record_underage_attempt()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.users
     set underage_attempted_at = coalesce(underage_attempted_at, now())
   where id = auth.uid();

  delete from public.profile_photos where user_id = auth.uid();
  delete from public.profiles where user_id = auth.uid();
end;
$$;

revoke all on function public.record_underage_attempt() from public;
grant execute on function public.record_underage_attempt() to authenticated;

-- --------------------------------------------- completion integrity (trigger)
-- onboarding_completed_at can only transition null -> non-null when the
-- profile is genuinely complete and the account is not underage-flagged.
create or replace function public.assert_onboarding_complete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.onboarding_completed_at is not null
     and old.onboarding_completed_at is null then

    if exists (
      select 1 from public.users u
      where u.id = new.user_id and u.underage_attempted_at is not null
    ) then
      raise exception 'onboarding blocked: underage attempt recorded';
    end if;

    if new.display_name is null or new.birthdate is null or new.gender is null then
      raise exception 'onboarding incomplete: missing required fields';
    end if;

    if new.birthdate > (current_date - interval '18 years') then
      raise exception 'onboarding blocked: must be 18 or older';
    end if;

    if not exists (
      select 1 from public.profile_photos p where p.user_id = new.user_id
    ) then
      raise exception 'onboarding incomplete: at least one photo required';
    end if;
  end if;

  -- primary_photo_path ne peut pointer que vers une photo de l'utilisateur.
  if new.primary_photo_path is not null and not exists (
    select 1 from public.profile_photos p
    where p.user_id = new.user_id
      and p.storage_path = new.primary_photo_path
  ) then
    raise exception 'primary photo must be one of the user''s photos';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_assert_onboarding_complete on public.profiles;
create trigger profiles_assert_onboarding_complete
  before update on public.profiles
  for each row execute function public.assert_onboarding_complete();

-- ------------------------------------------------------- photo reordering RPC
-- unique(user_id, position) empêche un swap en deux UPDATEs ; on la rend
-- DEFERRABLE et le swap se fait dans une fonction, contrainte différée.
alter table public.profile_photos
  drop constraint if exists profile_photos_user_id_position_key;
alter table public.profile_photos
  add constraint profile_photos_user_id_position_key
    unique (user_id, position) deferrable initially immediate;

-- SECURITY INVOKER : la RLS s'applique, ET la propriété est vérifiée
-- explicitement (row count contrôlé — jamais de swap silencieusement partiel).
create or replace function public.swap_photo_positions(photo_a uuid, photo_b uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  pos_a smallint;
  pos_b smallint;
  updated integer;
begin
  set constraints public.profile_photos_user_id_position_key deferred;

  select position into pos_a from public.profile_photos
    where id = photo_a and user_id = auth.uid();
  select position into pos_b from public.profile_photos
    where id = photo_b and user_id = auth.uid();
  if pos_a is null or pos_b is null then
    raise exception 'photo not found or not owned';
  end if;

  update public.profile_photos set position = pos_b
    where id = photo_a and user_id = auth.uid();
  get diagnostics updated = row_count;
  if updated <> 1 then raise exception 'swap failed'; end if;

  update public.profile_photos set position = pos_a
    where id = photo_b and user_id = auth.uid();
  get diagnostics updated = row_count;
  if updated <> 1 then raise exception 'swap failed'; end if;
end;
$$;

revoke all on function public.swap_photo_positions(uuid, uuid) from public;
grant execute on function public.swap_photo_positions(uuid, uuid) to authenticated;

-- Suppression + renumérotation ATOMIQUES (position 0 = photo principale doit
-- toujours exister s'il reste des photos). Renvoie le chemin storage à purger.
create or replace function public.delete_photo_and_compact(photo uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  removed_path text;
begin
  set constraints public.profile_photos_user_id_position_key deferred;

  delete from public.profile_photos
    where id = photo and user_id = auth.uid()
    returning storage_path into removed_path;
  if removed_path is null then
    raise exception 'photo not found or not owned';
  end if;

  with renumbered as (
    select id, row_number() over (order by position) - 1 as new_position
    from public.profile_photos
    where user_id = auth.uid()
  )
  update public.profile_photos p
     set position = r.new_position
    from renumbered r
   where p.id = r.id and p.position <> r.new_position;

  return removed_path;
end;
$$;

revoke all on function public.delete_photo_and_compact(uuid) from public;
grant execute on function public.delete_photo_and_compact(uuid) to authenticated;

-- ------------------------------------------------------------- storage bucket
-- Private bucket; size and MIME limits are enforced server-side by Supabase.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Each user is confined to their own folder: {auth.uid()}/{uuid}.{ext}.
-- Reads by OTHER users happen exclusively through server-generated signed
-- URLs (bucket is private), never through direct authenticated reads.
create policy "photos_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "photos_read_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "photos_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
