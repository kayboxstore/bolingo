-- ============================================================================
-- Bolingo — Web Push : abonnements + assemblage du payload (socle)
--
-- ⚠️ FICHIER UNIQUEMENT : à appliquer via `supabase db push`.
--
-- Complète les notifications in-app (0012) : une notif navigateur (hors onglet
-- actif) pour un nouveau match / nouveau message, via l'API Web Push standard
-- (service worker + VAPID), sans service tiers propriétaire.
--
-- Le déclenchement (pg_net vers la route d'envoi) vit dans 0016 — séparé comme
-- 0014, car pg_net/Vault sont une infra OPTIONNELLE : sans elle, la table reste
-- utilisable, les push ne partent simplement pas.
--
-- CONTRAINTE STRICTE (cf. in-app) : aucun contenu de message ne transite. Le
-- payload se limite à « Nouveau match avec {prénom} » / « {prénom} t'a envoyé un
-- message ». Le service push (navigateur/OS) est un tiers d'acheminement.
-- ============================================================================

-- ---------------------------------------------------- table des abonnements
-- Un abonnement = un couple (appareil, navigateur). Plusieurs par compte. Un
-- `endpoint` identifie de façon unique une subscription push → UNIQUE global :
-- un endpoint appartient à un seul compte (évite une misdelivery si un appareil
-- change de compte ; la réaffectation passe par la RPC ci-dessous).
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth_key     text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ------------------------------------------------------------------- RLS
-- Lecture/suppression : ses propres abonnements uniquement. L'écriture (insert)
-- passe par la RPC DEFINER save_push_subscription (invariant « 1 endpoint = son
-- propriétaire courant »), donc insert/update révoqués côté client.
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon;
revoke insert, update on table public.push_subscriptions from authenticated;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select using ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete using ((select auth.uid()) = user_id);

-- --------------------------------------------- enregistrement d'un abonnement
-- DEFINER : upsert atomique sur `endpoint` (UNIQUE global) → race-safe même sous
-- appels concurrents (plusieurs onglets), et un endpoint réassigné bascule
-- atomiquement vers son nouveau propriétaire (excluded.user_id). L'owner =
-- auth.uid() (non paramétrable) : on ne peut abonner que soi-même. Compte
-- suspendu/supprimé/mineur bloqué : refuse. Plafond par utilisateur (anti-gonfle
-- de la table et du fan-out d'envoi) : on ne garde que les 10 plus récents.
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not private.caller_active() then
    raise exception 'account not active' using errcode = 'check_violation';
  end if;
  -- Défense en profondeur : la RPC est grant to authenticated, donc appelable
  -- directement via /rpc en contournant le zod du Server Action. On borne ici
  -- aussi (endpoint https borné, clés bornées) — cohérent avec les CHECK en base.
  if p_endpoint is null or p_endpoint not like 'https://%' or length(p_endpoint) > 1000
     or p_p256dh is null or length(p_p256dh) = 0 or length(p_p256dh) > 200
     or p_auth is null or length(p_auth) = 0 or length(p_auth) > 200 then
    raise exception 'invalid subscription' using errcode = 'check_violation';
  end if;

  insert into public.push_subscriptions
    (user_id, endpoint, p256dh, auth_key, user_agent, last_used_at)
  values
    (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300), now())
  on conflict (endpoint) do update
    set user_id      = excluded.user_id,
        p256dh       = excluded.p256dh,
        auth_key     = excluded.auth_key,
        user_agent   = excluded.user_agent,
        last_used_at = excluded.last_used_at;

  -- Plafond : au plus 10 abonnements par compte ; purge les plus anciens.
  delete from public.push_subscriptions
  where user_id = auth.uid()
    and id not in (
      select id from public.push_subscriptions
      where user_id = auth.uid()
      order by coalesce(last_used_at, created_at) desc, id desc
      limit 10
    );
end;
$$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ------------------------------------------------ assemblage du payload push
-- Appelée par la route d'envoi (service-role) pour un id de notification donné.
-- Re-applique le MÊME filtre de visibilité qu'in-app (destinataire actif ;
-- acteur actif et non bloqué) — ceinture pour le laps async entre l'insert de la
-- notif et l'envoi. Renvoie null si supprimé/aucun abonnement. JAMAIS de contenu
-- de message : titre/corps dérivés du prénom de l'acteur + type.
create or replace function public.get_push_payload(p_notification_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  n record;
  actor_name text;
  subs jsonb;
  v_title text;
  v_body text;
  v_url text;
  v_tag text;
begin
  select recipient_id, type, actor_id, match_id
    into n
  from public.notifications
  where id = p_notification_id;
  if not found then
    return null;
  end if;

  -- destinataire suspendu/supprimé → aucun push
  if not private.user_is_active(n.recipient_id) then
    return null;
  end if;

  -- acteur suspendu/supprimé/bloqué → aucun push (cohérent list_notifications)
  if n.actor_id is not null and (
       not private.user_is_active(n.actor_id)
       or private.blocks_between(n.recipient_id, n.actor_id)
     ) then
    return null;
  end if;

  select display_name into actor_name
  from public.profiles where user_id = n.actor_id;
  actor_name := coalesce(nullif(actor_name, ''), 'quelqu''un');

  if n.type = 'new_match' then
    v_title := 'Nouveau match';
    v_body := 'Tu as un nouveau match avec ' || actor_name;
    v_url := '/matches';
    v_tag := 'match-' || coalesce(n.match_id::text, '');
  else
    v_title := 'Nouveau message';
    v_body := actor_name || ' t''a envoyé un message';
    v_url := case when n.match_id is not null
                  then '/messages/' || n.match_id::text
                  else '/matches' end;
    v_tag := 'msg-' || coalesce(n.match_id::text, '');
  end if;

  select jsonb_agg(jsonb_build_object(
           'endpoint', ps.endpoint,
           'p256dh', ps.p256dh,
           'auth', ps.auth_key
         ))
    into subs
  from public.push_subscriptions ps
  where ps.user_id = n.recipient_id;

  if subs is null then
    return null;  -- aucun appareil abonné
  end if;

  return jsonb_build_object(
    'title', v_title,
    'body', v_body,
    'url', v_url,
    'tag', v_tag,
    'subscriptions', subs
  );
end;
$$;
revoke all on function public.get_push_payload(uuid) from public, anon, authenticated;
grant execute on function public.get_push_payload(uuid) to service_role;
