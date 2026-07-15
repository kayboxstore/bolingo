-- ============================================================================
-- Bolingo — moderation (blocage + signalement)
--
-- ⚠️ FICHIER UNIQUEMENT : à appliquer par l'utilisateur via `supabase db push`
-- (règle CLAUDE.md — aucune écriture sur le projet réel sans confirmation).
--
-- Le socle existe déjà (0001) : tables `blocks` (policy blocks_own :
-- insert/select/delete de ses propres blocages) et `reports` (policies
-- insert-own / select-own / update-admin). L'EFFET du blocage est déjà câblé
-- partout via blocks_between. Cette migration ajoute :
--   * verrouillage colonnes de reports (le client ne pose jamais `status`)
--   * RPC submit_report (snapshot du handle, dedupe, validation preuve)
--   * RPC list_blocked (voir qui on a bloqué malgré le masquage RLS)
-- ============================================================================

-- ------------------------------------------------ reports : écriture verrouillée
-- Le client ne renseigne que les champs du signalement — jamais status /
-- updated_at (réservés à la modération admin).
revoke insert on table public.reports from authenticated, anon;
grant insert (reporter_id, reported_id, reported_handle, category, reason,
              details, message_id)
  on table public.reports to authenticated;

-- ------------------------------------------------------------- submit_report()
-- DEFINER : renseigne reported_handle (snapshot du display_name, qui survit à
-- la suppression du compte signalé même quand le profil n'est pas lisible par
-- le rapporteur), valide l'auto-signalement et la preuve, déduplique.
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

  -- Le message-preuve doit appartenir à une conversation entre les deux.
  if p_message_id is not null and not exists (
    select 1
    from public.messages msg
    join public.matches m on m.id = msg.match_id
    where msg.id = p_message_id
      and ((m.user_a = auth.uid() and m.user_b = p_reported)
        or (m.user_b = auth.uid() and m.user_a = p_reported))
  ) then
    raise exception 'evidence message not in this conversation'
      using errcode = 'check_violation';
  end if;

  -- Dédup : un signalement ouvert du même rapporteur sur la même cible dans
  -- les dernières 24 h → no-op (anti-spam, idempotent).
  if exists (
    select 1 from public.reports r
    where r.reporter_id = auth.uid()
      and r.reported_id = p_reported
      and r.status in ('open', 'reviewing')
      and r.created_at > now() - interval '24 hours'
  ) then
    return;
  end if;

  select display_name into handle
  from public.profiles where user_id = p_reported;

  insert into public.reports
    (reporter_id, reported_id, reported_handle, category, reason, details, message_id)
  values
    (auth.uid(), p_reported, handle, p_category, p_category::text, p_details, p_message_id);
end;
$$;
revoke all on function public.submit_report(uuid, report_category, text, uuid) from public;
revoke execute on function public.submit_report(uuid, report_category, text, uuid) from anon;
grant execute on function public.submit_report(uuid, report_category, text, uuid) to authenticated;

-- --------------------------------------------------------------- list_blocked()
-- Une fois bloqué, blocks_between masque le profil de l'autre → le bloqueur ne
-- verrait plus qui il a bloqué. Ce DEFINER renvoie ses propres blocages avec
-- nom/photo, borné à auth.uid() (aucune fuite de tiers).
create or replace function public.list_blocked()
returns table (
  blocked_id uuid,
  display_name text,
  photo_path text,
  blocked_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    b.blocked_id,
    p.display_name,
    photo.storage_path,
    b.created_at
  from public.blocks b
  left join public.profiles p on p.user_id = b.blocked_id
  left join lateral (
    select pp.storage_path from public.profile_photos pp
    where pp.user_id = b.blocked_id and pp.moderation_status = 'approved'
    order by pp.position limit 1
  ) photo on true
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;
revoke all on function public.list_blocked() from public;
revoke execute on function public.list_blocked() from anon;
grant execute on function public.list_blocked() to authenticated;
