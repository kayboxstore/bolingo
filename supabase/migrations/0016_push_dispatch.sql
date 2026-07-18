-- ============================================================================
-- Bolingo — Web Push : déclenchement de l'envoi (pg_net)
--
-- ⚠️ FICHIER UNIQUEMENT. SÉPARÉ de 0015 À DESSEIN : pg_net + Vault sont une
-- infra OPTIONNELLE. Un échec / une absence de config ici ne doit pas empêcher
-- l'enregistrement des abonnements (0015) ni les notifications in-app (0012).
--
-- Point d'intégration : AFTER INSERT sur public.notifications. Une ligne n'y
-- existe QUE si une notif doit être montrée (toute la suppression — match
-- actif, blocks, actif, collapse, fenêtre 15 s — est déjà appliquée par les
-- triggers de 0012). Le push hérite donc gratuitement de ces règles. On ne
-- déclenche l'appel HTTP que si le destinataire a au moins un abonnement.
--
-- 🔧 PRÉ-REQUIS (une fois, côté utilisateur — AUCUN secret n'est commité) :
--   1. Poser `CRON_SECRET` dans l'env de l'app (Vercel) — réutilisé ici comme
--      secret partagé de la route /api/push/send.
--   2. Créer deux secrets Supabase Vault (Dashboard → Project Settings → Vault) :
--        push_dispatch_url    = https://<ton-domaine>/api/push/send
--        push_dispatch_secret = <la même valeur que CRON_SECRET>
--   3. S'assurer que pg_net est activé (Dashboard → Extensions).
--   Tant que les secrets Vault sont absents, le trigger s'exécute mais ne fait
--   rien (no-op journalisé via raise notice) — il ne casse rien.
-- ============================================================================

create extension if not exists pg_net;

-- Lit l'URL + le secret depuis Vault (jamais en dur) et POST la route d'envoi
-- avec l'id de la notification. Non exposée aux clients.
create or replace function public.dispatch_push()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Rien à envoyer si le destinataire n'a aucun appareil abonné : évite un
  -- appel HTTP par notification pour les comptes sans push.
  if not exists (
    select 1 from public.push_subscriptions ps where ps.user_id = new.recipient_id
  ) then
    return new;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'push_dispatch_secret';

  if v_url is null or v_secret is null then
    raise notice 'web push: secrets Vault manquants — dispatch ignoré';
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$$;
revoke all on function public.dispatch_push() from public, anon, authenticated;

drop trigger if exists notifications_dispatch_push on public.notifications;
create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row execute function public.dispatch_push();
