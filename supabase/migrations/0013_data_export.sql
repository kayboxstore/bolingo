-- ============================================================================
-- Bolingo — export RGPD (portabilité) + socle du nettoyage Storage
--
-- ⚠️ FICHIER UNIQUEMENT : à appliquer via `supabase db push`.
--
-- Complément du droit à l'effacement (0010) : l'utilisateur peut télécharger
-- une copie JSON de SES données. Aucune donnée d'un tiers au-delà d'un ID
-- technique (jamais email/téléphone/localisation/nom d'autrui).
--
-- La planification pg_cron du nettoyage vit dans 0014 (comme 0011) pour ne pas
-- coupler ce socle à la disponibilité de pg_cron/pg_net.
-- ============================================================================

-- ------------------------------------------------------- export_my_data()
-- Assemble un jsonb des données de l'appelant. Les autres personnes ne sont
-- désignées que par leur user_id (identifiant technique, non-PII) — jamais leur
-- profil/contacts. On exclut les coordonnées GPS brutes (dérivées, non saisies).
create or replace function public.export_my_data()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not private.caller_active() then
    raise exception 'account not active' using errcode = 'check_violation';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'account', (
      select jsonb_build_object(
        'id', u.id, 'email', u.email, 'status', u.status, 'created_at', u.created_at
      )
      from public.users u where u.id = uid
    ),
    'profile', (
      select jsonb_build_object(
        'display_name', p.display_name, 'bio', p.bio, 'city', p.city,
        'gender', p.gender, 'orientation', p.orientation, 'birthdate', p.birthdate,
        'interested_in', p.interested_in, 'age_min', p.age_min, 'age_max', p.age_max,
        'max_distance_km', p.max_distance_km, 'is_visible', p.is_visible,
        'created_at', p.created_at
      )
      from public.profiles p where p.user_id = uid
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'storage_path', pp.storage_path, 'position', pp.position,
        'moderation_status', pp.moderation_status, 'created_at', pp.created_at
      ) order by pp.position), '[]'::jsonb)
      from public.profile_photos pp where pp.user_id = uid
    ),
    'matches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'match_id', m.id,
        'other_user_id', case when m.user_a = uid then m.user_b else m.user_a end,
        'status', m.status, 'matched_at', m.created_at
      ) order by m.created_at), '[]'::jsonb)
      from public.matches m where m.user_a = uid or m.user_b = uid
    ),
    'messages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'match_id', msg.match_id,
        'other_user_id', case when m.user_a = uid then m.user_b else m.user_a end,
        'direction', case when msg.sender_id = uid then 'sent' else 'received' end,
        'content', case when msg.deleted_at is not null then null else msg.content end,
        'deleted', (msg.deleted_at is not null),
        'created_at', msg.created_at
      ) order by msg.created_at), '[]'::jsonb)
      from public.messages msg
      join public.matches m on m.id = msg.match_id
      where m.user_a = uid or m.user_b = uid
    ),
    'reports_sent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'category', r.category, 'details', r.details,
        'reported_user_id', r.reported_id, 'status', r.status, 'created_at', r.created_at
      ) order by r.created_at), '[]'::jsonb)
      from public.reports r where r.reporter_id = uid
    )
  ) into result;

  return result;
end;
$$;
revoke all on function public.export_my_data() from public;
revoke execute on function public.export_my_data() from anon;
grant execute on function public.export_my_data() to authenticated;

-- ------------------------------------------------------------- data_exports
-- Journal des exports : rate-limit (1 / heure) + suivi des fichiers pour le
-- nettoyage. Lecture own-only ; écriture réservée aux RPC/route DEFINER/service.
create table if not exists public.data_exports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  storage_path text,
  created_at   timestamptz not null default now()
);
create index if not exists data_exports_user_idx
  on public.data_exports (user_id, created_at desc);

alter table public.data_exports enable row level security;
drop policy if exists data_exports_select_own on public.data_exports;
create policy data_exports_select_own on public.data_exports
  for select using ((select auth.uid()) = user_id);
revoke insert, update, delete on table public.data_exports from authenticated, anon;

-- Enregistre un export (rate-limit atomique : refuse si un export < 1 h existe).
create or replace function public.record_data_export(p_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (
    select 1 from public.data_exports
    where user_id = auth.uid() and created_at > now() - interval '1 hour'
  ) then
    raise exception 'rate limited' using errcode = 'check_violation';
  end if;
  insert into public.data_exports (user_id, storage_path) values (auth.uid(), p_path);
end;
$$;
revoke all on function public.record_data_export(text) from public;
revoke execute on function public.record_data_export(text) from anon;
grant execute on function public.record_data_export(text) to authenticated;

-- ------------------------------------------------------ bucket privé exports
-- Fichiers d'export (PII) : bucket privé, aucune policy client → seul le
-- service-role (server action / route cron) y écrit/lit/signe. Court-lived
-- (nettoyé sous 24 h par le job de 0014).
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

-- --------------------------------------------------- log du nettoyage Storage
create table if not exists public.storage_cleanup_runs (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),
  deleted_count integer not null
);
alter table public.storage_cleanup_runs enable row level security;
drop policy if exists storage_cleanup_runs_admin on public.storage_cleanup_runs;
create policy storage_cleanup_runs_admin on public.storage_cleanup_runs
  for select using (private.is_admin(auth.uid()));
revoke insert, update, delete on table public.storage_cleanup_runs from authenticated, anon;

-- ------------------------------------------- énumération des objets orphelins
-- Renvoie les objets à supprimer, pour la route cron (service-role) qui fait le
-- vrai .remove() via l'API Storage (un DELETE SQL sur storage.objects ne
-- retirerait pas le fichier physique). DOUBLE VÉRIFICATION anti-bug : `not
-- exists` (NULL-safe, contrairement à `not in`) + filtre d'ancienneté → jamais
-- un objet référencé ni un upload en cours (< 48 h). Réservé au rôle service.
create or replace function public.list_orphan_storage_paths()
returns table (bucket text, path text)
language sql stable security definer set search_path = ''
as $$
  -- photos sans ligne profile_photos, âgées de > 48 h (marge upload en cours)
  select 'profile-photos'::text, o.name
  from storage.objects o
  where o.bucket_id = 'profile-photos'
    and o.created_at < now() - interval '48 hours'
    and not exists (
      select 1 from public.profile_photos pp where pp.storage_path = o.name
    )
  union all
  -- fichiers d'export de plus de 24 h
  select 'exports'::text, o.name
  from storage.objects o
  where o.bucket_id = 'exports'
    and o.created_at < now() - interval '24 hours';
$$;
revoke all on function public.list_orphan_storage_paths() from public, anon, authenticated;
grant execute on function public.list_orphan_storage_paths() to service_role;
