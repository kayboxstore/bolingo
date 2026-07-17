-- ============================================================================
-- Bolingo — planification du nettoyage Storage (pg_cron + pg_net)
--
-- ⚠️ FICHIER UNIQUEMENT. SÉPARÉ de 0013 À DESSEIN : pg_cron/pg_net sont des
-- dépendances d'infra OPTIONNELLES. Un échec ici ne doit pas empêcher l'export
-- RGPD (0013) de fonctionner.
--
-- La suppression physique des fichiers passe par l'API Storage (route
-- /api/cron/storage-cleanup, service-role) — un DELETE SQL sur storage.objects
-- ne retirerait pas le fichier. pg_cron déclenche donc la route via pg_net.
--
-- 🔧 PRÉ-REQUIS (à faire une fois, côté utilisateur — AUCUN secret n'est commité) :
--   1. Poser `CRON_SECRET` dans les variables d'env de l'app (Vercel) — le
--      secret partagé attendu par la route.
--   2. Créer deux secrets Supabase Vault (Dashboard → Project Settings → Vault) :
--        storage_cleanup_url    = https://<ton-domaine>/api/cron/storage-cleanup
--        storage_cleanup_secret = <la même valeur que CRON_SECRET>
--   3. S'assurer que pg_cron et pg_net sont activés (Dashboard → Extensions).
--   Tant que les secrets Vault sont absents, le job s'exécute mais ne fait rien
--   (no-op journalisé) — il ne casse pas.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Lit l'URL + le secret depuis Vault (jamais en dur dans le fichier) et POST la
-- route de nettoyage. Non exposée aux clients.
create or replace function public.trigger_storage_cleanup()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'storage_cleanup_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'storage_cleanup_secret';

  if v_url is null or v_secret is null then
    raise notice 'storage cleanup: secrets Vault manquants — job ignoré';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.trigger_storage_cleanup() from public, anon, authenticated;

-- Tous les jours à 03:42 UTC (heure creuse, décalée des autres jobs). Idempotent.
do $$
begin
  perform cron.unschedule('storage-cleanup');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'storage-cleanup',
  '42 3 * * *',
  $$select public.trigger_storage_cleanup()$$
);
