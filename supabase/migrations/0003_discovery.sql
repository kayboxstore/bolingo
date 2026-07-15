-- ============================================================================
-- Bolingo — discovery feed
--   * discover_profiles() RPC : lots de candidats triés par distance (KNN)
--   * index GiST partiel aligné sur le prédicat du feed
--   * photos du feed lisibles via une policy Storage dédiée (bucket privé)
--   * colonne profiles.location retirée de la surface client (PostgREST)
--   * blocage mineur étendu aux écritures sur likes
--
-- La RPC est SECURITY DEFINER (search_path épinglé) : c'est ce qui permet
-- (1) de révoquer la lecture client de `location` tout en calculant la
-- distance côté serveur, et (2) d'inliner les prédicats de visibilité pour
-- que l'index GiST partiel soit réellement utilisable (une fonction opaque
-- dans le WHERE empêche le planner de prouver le prédicat partiel).
-- Elle ne renvoie JAMAIS de coordonnées — seulement une distance arrondie
-- au km (et la base ne stocke que des centroïdes de ville).
-- ============================================================================

-- ------------------------------------------------------------------- indexes
-- GiST partiel : ne couvre que les profils que le feed peut servir.
create index if not exists profiles_location_feed_gix
  on public.profiles using gist (location)
  where is_visible and deleted_at is null and onboarding_completed_at is not null;

-- Résolution chemin -> ligne photo pour la policy Storage ci-dessous.
create index if not exists profile_photos_storage_path_idx
  on public.profile_photos (storage_path);

-- ------------------------------------------- location hors de portée du client
-- Un client PostgREST ne peut plus lire les coordonnées d'autrui : SELECT
-- column-level sans `location`. La RPC (DEFINER) reste seule à les lire.
revoke select on table public.profiles from authenticated;
revoke select on table public.profiles from anon;
grant select (
  user_id, display_name, birthdate, gender, orientation, bio, city,
  interested_in, age_min, age_max, max_distance_km, primary_photo_path,
  is_visible, onboarding_step, onboarding_completed_at, deleted_at,
  created_at, updated_at
) on table public.profiles to authenticated;

-- --------------------------------------------------------------- RLS refresh
-- profiles_select : forme InitPlan `(select auth.uid())` (lint Supabase
-- auth_rls_initplan — évalué une fois par scan, pas par ligne).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    (select auth.uid()) = user_id
    or (
      is_visible
      and deleted_at is null
      and onboarding_completed_at is not null
      and not public.blocks_between((select auth.uid()), user_id)
      and public.user_is_active(user_id)
    )
  );

-- likes : le blocage mineur s'applique aussi ici (défense en profondeur —
-- un compte flagué ne doit plus RIEN écrire, même en PostgREST direct).
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert with check (
    (select auth.uid()) = liker_id
    and liker_id <> likee_id
    and not public.blocks_between(liker_id, likee_id)
    and not public.is_underage_blocked((select auth.uid()))
  );

-- ------------------------------------------------------------- storage : feed
-- Les cartes du feed affichent les photos d'AUTRES utilisateurs : le caller
-- doit pouvoir signer ces objets. Lecture accordée uniquement si la photo est
-- approuvée ET que le profil est publiquement visible ET sans blocage mutuel.
create policy "photos_read_public_profiles" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and exists (
      select 1 from public.profile_photos pp
      where pp.storage_path = name
        and pp.moderation_status = 'approved'
        and public.profile_publicly_visible(pp.user_id)
        and not public.blocks_between(auth.uid(), pp.user_id)
    )
  );

-- ----------------------------------------------------------------------- RPC
-- search_path épinglé à deux schémas de confiance : PostGIS vit dans `public`
-- (installé par 0001) ou dans `extensions` (installation via le dashboard
-- Supabase) selon l'environnement — les deux layouts sont couverts. Nos
-- propres objets restent qualifiés `public.` explicitement.
create or replace function public.discover_profiles(
  batch_size integer default 10,
  exclude uuid[] default '{}'
)
returns table (
  user_id uuid,
  display_name text,
  age integer,
  bio text,
  city text,
  distance_km integer,
  primary_photo_path text
)
language plpgsql
stable
security definer
set search_path = 'public', 'extensions'
as $$
declare
  me record;
  wanted integer := least(greatest(coalesce(batch_size, 10), 1), 25);
begin
  -- Le paramètre exclude est borné : confort client, pas un contrat
  -- (l'idempotence réelle vient de l'anti-join sur likes).
  if array_length(exclude, 1) > 50 then
    exclude := exclude[1:50];
  end if;

  -- Mon profil : découverte réservée aux profils complets, comptes actifs.
  select p.user_id, p.gender, p.birthdate, p.interested_in,
         p.age_min, p.age_max, p.max_distance_km, p.location
    into me
    from public.profiles p
    join public.users u on u.id = p.user_id
   where p.user_id = auth.uid()
     and p.onboarding_completed_at is not null
     and p.deleted_at is null
     and u.status = 'active'
     and u.underage_attempted_at is null;

  if me.user_id is null then
    return; -- jamais une erreur : simplement aucun profil
  end if;

  if me.location is not null then
    -- Branche géo : KNN `<->` (mètres, index-ordonné sur le GiST partiel) —
    -- les filtres s'évaluent au fil de l'eau jusqu'à `wanted` lignes.
    return query
    select
      c.user_id,
      c.display_name,
      extract(year from age(c.birthdate))::integer as age,
      c.bio,
      c.city,
      greatest(1, round((c.location <-> me.location) / 1000.0))::integer as distance_km,
      photo.storage_path
    from public.profiles c
    join public.users cu on cu.id = c.user_id
    left join lateral (
      -- première photo APPROUVÉE (la colonne dénormalisée primary_photo_path
      -- pourrait pointer vers une photo flaguée/rejetée entre-temps)
      select pp.storage_path
      from public.profile_photos pp
      where pp.user_id = c.user_id and pp.moderation_status = 'approved'
      order by pp.position
      limit 1
    ) photo on true
    where c.user_id <> me.user_id
      and not (c.user_id = any(exclude))
      -- prédicats bruts : prouvent l'index GiST partiel (pas de fonction opaque)
      and c.is_visible
      and c.deleted_at is null
      and c.onboarding_completed_at is not null
      and cu.status = 'active'
      and cu.underage_attempted_at is null
      and c.location is not null
      and st_dwithin(c.location, me.location, me.max_distance_km * 1000.0)
      -- intérêt de genre réciproque (@> sert le GIN profiles_interested_in_gin)
      and c.gender = any(me.interested_in)
      and c.interested_in @> array[me.gender]
      -- tranche d'âge réciproque, forme sargable côté candidat
      and c.birthdate <= (current_date - make_interval(years => me.age_min))
      and c.birthdate >  (current_date - make_interval(years => me.age_max + 1))
      and extract(year from age(me.birthdate)) between c.age_min and c.age_max
      -- blocages, dans les deux sens (inline : DEFINER voit toutes les lignes)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me.user_id and b.blocked_id = c.user_id)
           or (b.blocker_id = c.user_id and b.blocked_id = me.user_id)
      )
      -- jamais un profil déjà liké/passé
      and not exists (
        select 1 from public.likes l
        where l.liker_id = me.user_id and l.likee_id = c.user_id
      )
    order by c.location <-> me.location, c.user_id
    limit wanted;
  else
    -- Branche sans géoloc (géocodage indisponible) : jamais bloquant —
    -- pas de filtre distance, tri par activité récente.
    return query
    select
      c.user_id,
      c.display_name,
      extract(year from age(c.birthdate))::integer as age,
      c.bio,
      c.city,
      null::integer as distance_km,
      photo.storage_path
    from public.profiles c
    join public.users cu on cu.id = c.user_id
    left join lateral (
      select pp.storage_path
      from public.profile_photos pp
      where pp.user_id = c.user_id and pp.moderation_status = 'approved'
      order by pp.position
      limit 1
    ) photo on true
    where c.user_id <> me.user_id
      and not (c.user_id = any(exclude))
      and c.is_visible
      and c.deleted_at is null
      and c.onboarding_completed_at is not null
      and cu.status = 'active'
      and cu.underage_attempted_at is null
      and c.gender = any(me.interested_in)
      and c.interested_in @> array[me.gender]
      and c.birthdate <= (current_date - make_interval(years => me.age_min))
      and c.birthdate >  (current_date - make_interval(years => me.age_max + 1))
      and extract(year from age(me.birthdate)) between c.age_min and c.age_max
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me.user_id and b.blocked_id = c.user_id)
           or (b.blocker_id = c.user_id and b.blocked_id = me.user_id)
      )
      and not exists (
        select 1 from public.likes l
        where l.liker_id = me.user_id and l.likee_id = c.user_id
      )
    order by cu.last_active_at desc nulls last, c.user_id
    limit wanted;
  end if;
end;
$$;

revoke all on function public.discover_profiles(integer, uuid[]) from public;
grant execute on function public.discover_profiles(integer, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Validation manuelle du plan (à exécuter sur une base peuplée, APRÈS
-- `analyze public.profiles, public.likes, public.blocks`) :
--
--   -- extraire la requête de la branche géo avec des paramètres littéraux,
--   -- ou activer auto_explain avec auto_explain.log_nested_statements = on
--   explain (analyze, buffers, verbose) select * from public.discover_profiles(10, '{}');
--
-- Attendu :
--   1. Index Scan using profiles_location_feed_gix + ligne « Order By:
--      (c.location <-> $N) » (chemin KNN) — PAS de Seq Scan ni de Sort complet
--      (un Incremental Sort sur user_id après la clé KNN est acceptable).
--   2. Anti-join likes : Index (Only) Scan using likes_outgoing_idx,
--      Index Cond (liker_id = $me AND likee_id = c.user_id).
--   3. Appeler la RPC ≥ 7 fois dans la même session : le plan ne doit pas se
--      dégrader au passage au plan générique.
--   4. Buffers du scan GiST proportionnels aux lignes retournées, pas à la
--      taille de la table.
-- ----------------------------------------------------------------------------
