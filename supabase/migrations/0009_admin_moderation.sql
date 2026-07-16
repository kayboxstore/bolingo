-- ============================================================================
-- Bolingo — back-office modération (admin)
--
-- ⚠️ FICHIER UNIQUEMENT : à appliquer par l'utilisateur via `supabase db push`
-- (règle CLAUDE.md — aucune écriture sur le projet réel sans confirmation).
-- L'activation du flag `is_admin` sur un compte réel est faite MANUELLEMENT par
-- l'utilisateur en SQL après application — jamais par l'agent.
--
-- L'infrastructure admin existe déjà et est RÉUTILISÉE (pas de duplication) :
--   * users.is_admin (0001) + private.is_admin(uid) (0001→0004)
--   * account_status 'active'|'suspended'|'deleted' (0001) ; suspendre coupe
--     l'accès partout via caller_active() (0007)
--   * RLS reports_select / reports_update_admin / users_select_self (0001) :
--     l'admin lit tous les reports et tous les users, et peut mettre à jour.
--   * écriture de is_admin/status déjà verrouillée (revoke update 0002 + RLS
--     users_update_self with-check qui épingle is_admin/status).
--
-- Cette migration ajoute uniquement ce qui manque :
--   1. snapshot du contenu-preuve sur reports (durable même si le message est
--      supprimé plus tard) ;
--   2. verrouillage de la LECTURE de is_admin (l'écriture l'était déjà) ;
--   3. wrapper current_user_is_admin() pour le guard de route ;
--   4. table de log simple admin_actions ;
--   5. RPC DEFINER d'admin (liste/détail/action), toutes gardées par is_admin.
-- ============================================================================

-- ------------------------------------------ 1. snapshot du contenu-preuve
-- reports.message_id est une référence LIVE : si le message est soft-supprimé
-- (contenu scrubé), la preuve disparaît. On fige le contenu au moment du
-- signalement. Écrit UNIQUEMENT par submit_report (INSERT client déjà révoqué
-- en 0008) → non falsifiable.
-- NB rétention/RGPD (dette assumée) : ce snapshot conserve du contenu privé
-- indéfiniment, y compris pour des reports rejetés — à contre-courant du scrub
-- au soft-delete de message (0007). Prévoir une purge/anonymisation de
-- evidence_content pour les reports resolved/dismissed anciens (job périodique).
alter table public.reports add column if not exists evidence_content text;

create or replace function public.submit_report(
  p_reported uuid,
  p_category report_category,
  p_details text default null,
  p_message_id uuid default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  handle text;
  evidence text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not private.caller_active() then
    raise exception 'account not active' using errcode = 'check_violation';
  end if;
  if p_reported is null or p_reported = auth.uid() then
    raise exception 'invalid target' using errcode = 'check_violation';
  end if;

  -- Anti-flooding : plafonne le volume horaire de signalements du rapporteur.
  if (
    select count(*) from public.reports r
    where r.reporter_id = auth.uid()
      and r.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'too many reports' using errcode = 'check_violation';
  end if;

  -- Le message-preuve doit appartenir à une conversation VIVANTE entre les deux ;
  -- on capture son contenu comme snapshot durable (survit à une suppression
  -- ultérieure du message).
  if p_message_id is not null then
    select msg.content into evidence
    from public.messages msg
    join public.matches m on m.id = msg.match_id
    where msg.id = p_message_id
      and msg.deleted_at is null
      and ((m.user_a = auth.uid() and m.user_b = p_reported)
        or (m.user_b = auth.uid() and m.user_a = p_reported));
    if not found then
      raise exception 'evidence message not in this conversation'
        using errcode = 'check_violation';
    end if;
  end if;

  select display_name into handle
  from public.profiles where user_id = p_reported;

  -- Dédup race-safe : l'index partiel unique reports_open_pair_uq garantit au
  -- plus un signalement ouvert par paire ; un doublon concurrent no-op.
  insert into public.reports
    (reporter_id, reported_id, reported_handle, category, reason, details,
     message_id, evidence_content)
  values
    (auth.uid(), p_reported, handle, p_category, p_category::text, p_details,
     p_message_id, evidence)
  on conflict (reporter_id, reported_id) where status in ('open', 'reviewing')
  do nothing;
end;
$$;
revoke all on function public.submit_report(uuid, report_category, text, uuid) from public;
revoke execute on function public.submit_report(uuid, report_category, text, uuid) from anon;
grant execute on function public.submit_report(uuid, report_category, text, uuid) to authenticated;

-- ------------------------------------------ 2. users : lecture minimisée
-- Un revoke COLONNE seul serait un no-op : public.users n'a jamais eu de revoke
-- SELECT table-wide (contrairement à profiles/matches), donc authenticated garde
-- le SELECT par défaut sur TOUTE la table. On révoque le SELECT table-wide puis
-- on whiteliste les seules colonnes lues côté client → is_admin, email, phone,
-- deleted_at, etc. ne sont plus jamais exposés (email/phone restent disponibles
-- via la session auth). Vérifié : aucun select("*") ni lecture de ces colonnes
-- côté app (les seuls .from("users").select lisent status/underage_attempted_at,
-- filtrés par id).
revoke select on table public.users from authenticated, anon;
grant select (id, status, underage_attempted_at)
  on table public.users to authenticated;

-- users_update_self (0001) épinglait is_admin/status dans le WITH CHECK par
-- référence directe aux colonnes. Or Postgres exige le privilège SELECT sur
-- TOUTE colonne référencée dans une expression de policy (markVarForSelectPriv,
-- agnostique « ancienne/nouvelle valeur » — précisément pour qu'une policy ne
-- serve pas d'oracle de lecture). is_admin étant désormais non-SELECT-able,
-- garder cette référence casserait TOUT UPDATE self (même last_active_at) avec
-- « permission denied for column is_admin ».
-- On retire ces pins : le vrai verrou anti-escalade est déjà le privilège UPDATE
-- COLONNE (0002 : seul last_active_at accordé) — PostgREST refuse tout PATCH
-- incluant is_admin/status avant même l'évaluation RLS. Les pins étaient une
-- défense en profondeur redondante, et cassante ici.
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- reports : l'UPDATE direct restait ouvert aux admins via reports_update_admin
-- (0001, jamais fermée). Un PATCH PostgREST pouvait réécrire evidence_content /
-- status / reported_handle hors de admin_resolve_report, donc SANS entrée dans
-- admin_actions (log d'audit contournable) et sans les garde-fous applicatifs.
-- On ferme : seule la RPC DEFINER écrit désormais (comme l'INSERT fermé en 0008).
drop policy if exists reports_update_admin on public.reports;
revoke update on table public.reports from authenticated, anon;

-- Index pour la file admin : filtre par status (dont resolved/dismissed, hors de
-- l'index partiel open/reviewing existant) + tri par date.
create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);

-- ------------------------------------------ 3. guard de route (self only)
-- Dit à l'appelant s'IL est admin — sans exposer la colonne. Sûr : ne renvoie
-- que l'état de auth.uid(). Sert au guard requireAdmin() (404 sinon).
create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin(auth.uid());
$$;
revoke all on function public.current_user_is_admin() from public;
revoke execute on function public.current_user_is_admin() from anon;
grant execute on function public.current_user_is_admin() to authenticated;

-- ------------------------------------------ 4. log d'actions admin (simple)
create table if not exists public.admin_actions (
  id               uuid primary key default gen_random_uuid(),
  admin_id         uuid references public.users(id) on delete set null,
  action           text not null,          -- 'dismiss'|'warn'|'suspend'|'reactivate'
  target_report_id uuid references public.reports(id) on delete set null,
  target_user_id   uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
-- Index partiel : dérivation de la date de suspension (max created_at pour
-- action='suspend' sur un compte donné).
create index if not exists admin_actions_suspend_idx
  on public.admin_actions (target_user_id, created_at desc)
  where action = 'suspend';

alter table public.admin_actions enable row level security;
-- Lecture admin uniquement ; écriture réservée aux RPC DEFINER (aucune policy
-- insert/update/delete → PostgREST refuse ; les DEFINER, propriétaires, passent).
drop policy if exists admin_actions_select on public.admin_actions;
create policy admin_actions_select on public.admin_actions
  for select using (private.is_admin(auth.uid()));
revoke insert, update, delete on table public.admin_actions from authenticated, anon;

-- ------------------------------------------ 5. RPC admin (toutes gate is_admin)
-- File des signalements, filtrable. Renvoie les handles (rapporteur via
-- profiles ; signalé via le snapshot reported_handle, lisible même si le profil
-- ne l'est plus) et le statut de compte courant du signalé.
create or replace function public.admin_list_reports(
  p_status report_status default null,
  p_category report_category default null
)
returns table (
  id uuid,
  reporter_id uuid,
  reporter_handle text,
  reported_id uuid,
  reported_handle text,
  reported_status account_status,
  category report_category,
  details text,
  evidence_content text,
  message_id uuid,
  status report_status,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;
  return query
    select
      r.id, r.reporter_id, rp.display_name, r.reported_id, r.reported_handle,
      u.status, r.category, r.details, r.evidence_content, r.message_id,
      r.status, r.created_at
    from public.reports r
    left join public.profiles rp on rp.user_id = r.reporter_id
    left join public.users u on u.id = r.reported_id
    where (p_status is null or r.status = p_status)
      and (p_category is null or r.category = p_category)
    order by r.created_at desc;
end;
$$;
revoke all on function public.admin_list_reports(report_status, report_category) from public;
revoke execute on function public.admin_list_reports(report_status, report_category) from anon;
grant execute on function public.admin_list_reports(report_status, report_category) to authenticated;

-- Détail d'un signalement.
create or replace function public.admin_get_report(p_id uuid)
returns table (
  id uuid,
  reporter_id uuid,
  reporter_handle text,
  reported_id uuid,
  reported_handle text,
  reported_status account_status,
  category report_category,
  details text,
  evidence_content text,
  message_id uuid,
  status report_status,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;
  return query
    select
      r.id, r.reporter_id, rp.display_name, r.reported_id, r.reported_handle,
      u.status, r.category, r.details, r.evidence_content, r.message_id,
      r.status, r.created_at
    from public.reports r
    left join public.profiles rp on rp.user_id = r.reporter_id
    left join public.users u on u.id = r.reported_id
    where r.id = p_id;
end;
$$;
revoke all on function public.admin_get_report(uuid) from public;
revoke execute on function public.admin_get_report(uuid) from anon;
grant execute on function public.admin_get_report(uuid) to authenticated;

-- Action sur un signalement : dismiss (rejeter), warn (traiter sans suite),
-- suspend (traiter + suspendre le compte signalé). Idempotent : agir sur un
-- report déjà traité met simplement à jour son statut, sans erreur.
create or replace function public.admin_resolve_report(p_id uuid, p_action text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_reported uuid;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('dismiss', 'warn', 'suspend') then
    raise exception 'invalid action' using errcode = 'check_violation';
  end if;

  select reported_id into v_reported from public.reports where id = p_id;
  if not found then
    raise exception 'report not found' using errcode = 'no_data_found';
  end if;

  -- Casts qualifiés public. : sous search_path='' (corps DEFINER), un type enum
  -- non qualifié ne résout pas (échec de compilation à db push).
  update public.reports
     set status = case when p_action = 'dismiss' then 'dismissed'::public.report_status
                       else 'resolved'::public.report_status end
   where id = p_id;

  if p_action = 'suspend' then
    if v_reported is null then
      raise exception 'reported account no longer exists'
        using errcode = 'check_violation';
    end if;
    if private.is_admin(v_reported) then
      raise exception 'cannot suspend an admin' using errcode = 'check_violation';
    end if;
    -- ne ressuscite jamais un compte supprimé ; suspend sinon.
    update public.users set status = 'suspended'
     where id = v_reported and status <> 'deleted';
  end if;

  insert into public.admin_actions (admin_id, action, target_report_id, target_user_id)
  values (auth.uid(), p_action, p_id, v_reported);
end;
$$;
revoke all on function public.admin_resolve_report(uuid, text) from public;
revoke execute on function public.admin_resolve_report(uuid, text) from anon;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;

-- Suspendre / réactiver un compte (vue « comptes suspendus »). Transitions
-- active↔suspended uniquement ; jamais un compte supprimé, ni soi-même, ni un
-- autre admin.
create or replace function public.admin_set_account_status(
  p_user uuid,
  p_suspend boolean
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_user is null or p_user = auth.uid() then
    raise exception 'invalid target' using errcode = 'check_violation';
  end if;
  if private.is_admin(p_user) then
    raise exception 'cannot change an admin account' using errcode = 'check_violation';
  end if;

  -- Atomique : la garde `status <> 'deleted'` est dans le WHERE (aucune fenêtre
  -- TOCTOU entre un SELECT et l'UPDATE) → un compte supprimé n'est jamais
  -- ressuscité. Casts qualifiés public. : un CASE à deux littéraux `unknown` se
  -- résout en `text` (pas de coercition implicite text→enum), et sous
  -- search_path='' le type enum doit être qualifié.
  update public.users
     set status = case when p_suspend then 'suspended'::public.account_status
                       else 'active'::public.account_status end
   where id = p_user and status <> 'deleted';
  if not found then
    raise exception 'account not found or deleted' using errcode = 'check_violation';
  end if;

  insert into public.admin_actions (admin_id, action, target_user_id)
  values (auth.uid(), case when p_suspend then 'suspend' else 'reactivate' end, p_user);
end;
$$;
revoke all on function public.admin_set_account_status(uuid, boolean) from public;
revoke execute on function public.admin_set_account_status(uuid, boolean) from anon;
grant execute on function public.admin_set_account_status(uuid, boolean) to authenticated;

-- Liste des comptes suspendus, avec la date de suspension dérivée du log.
create or replace function public.admin_list_suspended()
returns table (
  user_id uuid,
  display_name text,
  suspended_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;
  return query
    select
      u.id,
      p.display_name,
      (select max(a.created_at) from public.admin_actions a
        where a.target_user_id = u.id and a.action = 'suspend')
    from public.users u
    left join public.profiles p on p.user_id = u.id
    where u.status = 'suspended'
    order by (
      select max(a.created_at) from public.admin_actions a
      where a.target_user_id = u.id and a.action = 'suspend'
    ) desc nulls last;
end;
$$;
revoke all on function public.admin_list_suspended() from public;
revoke execute on function public.admin_list_suspended() from anon;
grant execute on function public.admin_list_suspended() to authenticated;
