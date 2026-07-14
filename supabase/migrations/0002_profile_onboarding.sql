-- ============================================================================
-- Motema — profile onboarding
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

revoke update on table public.users from authenticated;
grant update (email, phone, last_active_at) on table public.users to authenticated;

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

-- SECURITY INVOKER : la RLS s'applique — l'appelant ne peut toucher que ses
-- propres photos (les UPDATE ne matchent 0 ligne sinon, et on le détecte).
create or replace function public.swap_photo_positions(photo_a uuid, photo_b uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  pos_a smallint;
  pos_b smallint;
begin
  set constraints public.profile_photos_user_id_position_key deferred;

  select position into pos_a from public.profile_photos where id = photo_a;
  select position into pos_b from public.profile_photos where id = photo_b;
  if pos_a is null or pos_b is null then
    raise exception 'photo not found';
  end if;

  update public.profile_photos set position = pos_b where id = photo_a;
  update public.profile_photos set position = pos_a where id = photo_b;
end;
$$;

revoke all on function public.swap_photo_positions(uuid, uuid) from public;
grant execute on function public.swap_photo_positions(uuid, uuid) to authenticated;

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
