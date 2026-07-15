-- ============================================================================
-- Bolingo — function exposure hardening (issu des advisors Supabase, live)
--
-- Les privilèges PAR DÉFAUT de Supabase accordent EXECUTE à anon/authenticated
-- sur toute nouvelle fonction : nos helpers SECURITY DEFINER étaient donc
-- appelables via /rest/v1/rpc/* — dont deux oracles réels :
--   * blocks_between(a, b)      -> « X a-t-il bloqué Y ? »
--   * is_underage_blocked(uid)  -> « ce compte est-il flagué mineur ? »
--
-- Correctif : schéma `private` NON exposé par PostgREST. Les policies RLS et
-- Storage continuent de fonctionner (elles référencent les fonctions par OID,
-- que `ALTER FUNCTION … SET SCHEMA` ne change pas) ; les rôles API gardent
-- EXECUTE pour l'évaluation des policies, mais l'endpoint /rpc disparaît.
-- ============================================================================

create schema if not exists private;
grant usage on schema private to authenticated, anon;

alter function public.is_admin(uuid) set schema private;
alter function public.blocks_between(uuid, uuid) set schema private;
alter function public.is_underage_blocked(uuid) set schema private;
alter function public.user_is_active(uuid) set schema private;
alter function public.profile_publicly_visible(uuid) set schema private;

grant execute on function private.is_admin(uuid) to authenticated, anon;
grant execute on function private.blocks_between(uuid, uuid) to authenticated, anon;
grant execute on function private.is_underage_blocked(uuid) to authenticated, anon;
grant execute on function private.user_is_active(uuid) to authenticated, anon;
grant execute on function private.profile_publicly_visible(uuid) to authenticated, anon;

-- Fonctions trigger : jamais appelables par l'API (le déclenchement par
-- trigger ne requiert pas EXECUTE pour l'utilisateur).
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_like() from public, anon, authenticated;
revoke execute on function public.assert_onboarding_complete() from public, anon, authenticated;

-- Lint function_search_path_mutable : set_updated_at n'avait pas de pin.
alter function public.set_updated_at() set search_path = '';

-- RPCs applicatives : authenticated uniquement (anon les avait par défaut).
revoke execute on function public.discover_profiles(integer, uuid[]) from anon;
revoke execute on function public.record_underage_attempt() from anon;
revoke execute on function public.swap_photo_positions(uuid, uuid) from anon;
revoke execute on function public.delete_photo_and_compact(uuid) from anon;

-- Lint accepté (non corrigeable proprement) : `spatial_ref_sys` (table système
-- PostGIS, données SRID publiques, appartient à l'extension) et
-- `st_estimatedextent` (fonction C de l'extension) ; postgis installé dans
-- `public` par 0001 — la RPC feed couvre les deux layouts via son search_path.
