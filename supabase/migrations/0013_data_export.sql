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

-- ------------------------------------------------------------- data_exports
-- Journal de fréquence des exports (rate-limit 1/heure) — défini AVANT
-- export_my_data qui l'écrit. Lecture own-only ; écriture réservée au DEFINER.
create table if not exists public.data_exports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists data_exports_user_idx
  on public.data_exports (user_id, created_at desc);

alter table public.data_exports enable row level security;
drop policy if exists data_exports_select_own on public.data_exports;
create policy data_exports_select_own on public.data_exports
  for select using ((select auth.uid()) = user_id);
revoke insert, update, delete on table public.data_exports from authenticated, anon;

create or replace function public.export_my_data()
returns jsonb
language plpgsql security definer set search_path = ''
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

  -- Rate-limit atomique (1 / heure) : verrou par utilisateur puis vérif + insert
  -- dans la MÊME transaction → non contournable en appelant l'RPC en boucle
  -- (cette fonction est le seul point d'entrée et EST son propre compteur), et
  -- pas de course entre deux onglets. La table data_exports est le journal de
  -- fréquence. On throttle AVANT l'assemblage coûteux.
  perform pg_advisory_xact_lock(hashtext('bolingo.export'), hashtext(uid::text));
  if exists (
    select 1 from public.data_exports
    where user_id = uid and created_at > now() - interval '1 hour'
  ) then
    -- SQLSTATE dédié 'PT429' : PostgREST le mappe sur HTTP 429 et l'expose tel
    -- quel côté client (error.code), donc la route le détecte sans se fier au
    -- texte du message (distinct de 'account not active' / 'not authenticated').
    raise exception 'rate limited' using errcode = 'PT429';
  end if;
  insert into public.data_exports (user_id) values (uid);
  -- Purge de la traîne au prochain appel du même utilisateur (pas une fenêtre
  -- glissante globale) : borne le journal à au plus une ligne résiduelle par
  -- utilisateur. Rien d'autre à nettoyer — l'export n'écrit AUCUN fichier. La
  -- ligne qu'on vient d'insérer (created_at = now()) n'est jamais touchée.
  delete from public.data_exports
  where user_id = uid and created_at < now() - interval '1 hour';

  select jsonb_build_object(
    'exported_at', now(),
    'account', (
      select jsonb_build_object(
        'id', u.id, 'email', u.email, 'phone', u.phone,
        'status', u.status, 'created_at', u.created_at
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
    'likes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'likee_user_id', l.likee_id, 'type', l.type, 'created_at', l.created_at
      ) order by l.created_at), '[]'::jsonb)
      from public.likes l where l.liker_id = uid
    ),
    'blocks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'blocked_user_id', b.blocked_id, 'created_at', b.created_at
      ) order by b.created_at), '[]'::jsonb)
      from public.blocks b where b.blocker_id = uid
    ),
    'notifications', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', n.type, 'actor_user_id', n.actor_id, 'match_id', n.match_id,
        'created_at', n.created_at, 'read_at', n.read_at
      ) order by n.created_at), '[]'::jsonb)
      from public.notifications n where n.recipient_id = uid
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

-- NB : AUCUN bucket d'export. L'export RGPD est diffusé en streaming direct par
-- la Route Handler app/api/export/route.ts (réponse HTTP = le fichier), jamais
-- persisté sur Storage, même temporairement. Aucune URL signée, aucune PII au
-- repos. Le seul objet Storage nettoyé par le job (0014) = photos orphelines.

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

-- ------------------------------------------- énumération des objets à purger
-- Renvoie les objets à supprimer, pour la route cron (service-role) qui fait le
-- vrai .remove() via l'API Storage (un DELETE SQL sur storage.objects ne
-- retirerait pas le fichier physique). Une seule cible : les photos ORPHELINES,
-- avec DOUBLE VÉRIFICATION anti-bug : `not exists` (NULL-safe, contrairement à
-- `not in`) + ancienneté > 48 h (marge upload en cours) → jamais un objet
-- référencé ni un upload récent. (Pas de bucket d'export : l'export ne persiste
-- rien.) Réservé au rôle service.
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
    );
$$;
revoke all on function public.list_orphan_storage_paths() from public, anon, authenticated;
grant execute on function public.list_orphan_storage_paths() to service_role;
