-- ============================================================================
-- Motema — discovery feed
--   * discover_profiles() RPC: batched, distance-sorted candidate query
--   * partial GiST index aligned with the feed predicate
--
-- SECURITY INVOKER everywhere: RLS stays the security boundary. The RPC never
-- returns coordinates — only a distance rounded to the km (and the DB only
-- ever stores city centroids, never precise addresses).
-- ============================================================================

-- GiST partiel : ne couvre que les profils que le feed peut servir.
create index if not exists profiles_location_feed_gix
  on public.profiles using gist (location)
  where is_visible and deleted_at is null and onboarding_completed_at is not null;

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
set search_path = ''
as $$
declare
  me record;
  wanted integer := least(greatest(coalesce(batch_size, 10), 1), 25);
begin
  -- Le paramètre exclude est borné : c'est un confort client, pas un contrat.
  if array_length(exclude, 1) > 50 then
    exclude := exclude[1:50];
  end if;

  -- Mon profil : la découverte exige un profil complet, visible, compte actif.
  select p.user_id, p.gender, p.birthdate, p.interested_in,
         p.age_min, p.age_max, p.max_distance_km, p.location
    into me
    from public.profiles p
   where p.user_id = auth.uid()
     and p.onboarding_completed_at is not null
     and p.deleted_at is null;

  if me.user_id is null or not public.user_is_active(auth.uid())
     or public.is_underage_blocked(auth.uid()) then
    return; -- jamais une erreur : simplement aucun profil
  end if;

  return query
  select
    c.user_id,
    c.display_name,
    extract(year from age(c.birthdate))::integer as age,
    c.bio,
    c.city,
    case
      when me.location is null or c.location is null then null
      else greatest(1, round(st_distance(c.location, me.location) / 1000.0))::integer
    end as distance_km,
    c.primary_photo_path
  from public.profiles c
  where c.user_id <> me.user_id
    and not (c.user_id = any(exclude))
    -- visibilité publique (statut compte inclus) — même prédicat que la RLS
    and public.profile_publicly_visible(c.user_id)
    -- blocages, dans les deux sens
    and not public.blocks_between(me.user_id, c.user_id)
    -- jamais un profil déjà liké/passé (idempotence du feed)
    and not exists (
      select 1 from public.likes l
      where l.liker_id = me.user_id and l.likee_id = c.user_id
    )
    -- intérêt de genre réciproque
    and c.gender = any(me.interested_in)
    and me.gender = any(c.interested_in)
    -- tranche d'âge réciproque
    and extract(year from age(c.birthdate)) between me.age_min and me.age_max
    and extract(year from age(me.birthdate)) between c.age_min and c.age_max
    -- rayon de distance : uniquement quand les deux géolocs existent
    and (
      me.location is null
      or c.location is null
      or public.st_dwithin(c.location, me.location, me.max_distance_km * 1000.0)
    )
  order by
    case
      when me.location is null or c.location is null then null
      else public.st_distance(c.location, me.location)
    end asc nulls last,
    c.user_id
  limit wanted;
end;
$$;

revoke all on function public.discover_profiles(integer, uuid[]) from public;
grant execute on function public.discover_profiles(integer, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Validation manuelle du plan (à exécuter sur une base peuplée) :
--
--   set role authenticated;  -- simuler un utilisateur via request.jwt.claims
--   explain analyze
--   select * from public.discover_profiles(10, '{}');
--
-- Attendu : Index Scan sur profiles_location_feed_gix pour le ST_DWithin
-- (pas de Seq Scan sur profiles), et likes_outgoing_idx pour l'anti-join.
-- Si Seq Scan : vérifier que la table a été ANALYZE-ée et que le prédicat
-- partiel de l'index correspond bien aux filtres de la requête.
-- ----------------------------------------------------------------------------
