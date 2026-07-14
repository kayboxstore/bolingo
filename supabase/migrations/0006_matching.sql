-- ============================================================================
-- Motema — matching (like mutuel → match)
--
-- ⚠️ FICHIER UNIQUEMENT : à appliquer par l'utilisateur via `supabase db push`
-- (règle CLAUDE.md — aucune écriture sur le projet réel sans confirmation).
--
--   * trigger auto-match v2 : corrige la course de MATCH PERDU (deux likes
--     réciproques simultanés sous READ COMMITTED ne se voyaient pas l'un
--     l'autre → aucun match). Verrou advisory transactionnel sur la paire.
--   * notification in-app : matches.user_a_seen_at / user_b_seen_at
--   * unmatch durci : UPDATE column-level limité à `status` (la policy 0001
--     n'empêchait pas de réécrire user_a/user_b dans la même transition)
--   * RPC list_matches() / mark_matches_seen() (pattern DEFINER sanctionné)
-- ============================================================================

-- ------------------------------------------------------ auto-match trigger v2
create or replace function public.handle_new_like()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  a uuid;
  b uuid;
begin
  if new.type not in ('like','superlike') then
    return new;
  end if;

  a := least(new.liker_id, new.likee_id);
  b := greatest(new.liker_id, new.likee_id);

  -- Sérialise les deux insertions d'une même paire : le second like attend le
  -- commit du premier, puis son SELECT (nouveau snapshot en READ COMMITTED)
  -- voit le like réciproque. Sans ce verrou : match perdu en cas de
  -- simultanéité stricte. Le verrou est libéré au commit/rollback.
  perform pg_advisory_xact_lock(hashtextextended(a::text || '|' || b::text, 0));

  if exists (
    select 1 from public.likes l
    where l.liker_id = new.likee_id
      and l.likee_id = new.liker_id
      and l.type in ('like','superlike')
  ) then
    -- Idempotent : un doublon (ou une ligne `unmatched` existante) est un
    -- no-op — un unmatch n'est jamais ressuscité silencieusement.
    insert into public.matches (user_a, user_b)
    values (a, b)
    on conflict (user_a, user_b) do nothing;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------- new-match seen tracking
alter table public.matches
  add column if not exists user_a_seen_at timestamptz,
  add column if not exists user_b_seen_at timestamptz;

-- --------------------------------------------------- unmatch column hardening
-- La RLS (matches_update_participant, 0001) limite la transition à
-- status='unmatched', mais pas les colonnes modifiables dans le même UPDATE.
revoke update on table public.matches from authenticated;
revoke update on table public.matches from anon;
grant update (status) on table public.matches to authenticated;

-- -------------------------------------------------------------- list_matches
-- SECURITY DEFINER (pattern sanctionné, cf. CLAUDE.md) : la liste doit rester
-- servie même quand le profil de l'autre est devenu invisible/suspendu (la
-- RLS profiles_select le masquerait) — on renvoie alors profile_available =
-- false et des champs nuls. Aucune information de like non réciproque ne
-- transite : la source est exclusivement la table matches.
create or replace function public.list_matches()
returns table (
  match_id uuid,
  other_user_id uuid,
  display_name text,
  photo_path text,
  matched_at timestamptz,
  is_new boolean,
  profile_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id as match_id,
    case when m.user_a = auth.uid() then m.user_b else m.user_a end as other_user_id,
    p.display_name,
    photo.storage_path as photo_path,
    m.created_at as matched_at,
    (case when m.user_a = auth.uid() then m.user_a_seen_at else m.user_b_seen_at end)
      is null as is_new,
    (p.user_id is not null) as profile_available
  from public.matches m
  left join public.profiles p
    on p.user_id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
   and p.is_visible
   and p.deleted_at is null
   and exists (
     select 1 from public.users u
     where u.id = p.user_id and u.status = 'active'
   )
  left join lateral (
    select pp.storage_path
    from public.profile_photos pp
    where pp.user_id = p.user_id and pp.moderation_status = 'approved'
    order by pp.position
    limit 1
  ) photo on true
  where (m.user_a = auth.uid() or m.user_b = auth.uid())
    and m.status = 'active'
    -- un blocage post-match masque le match (la sécurité prime)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
         or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
    )
  order by m.created_at desc;
$$;

revoke all on function public.list_matches() from public;
revoke execute on function public.list_matches() from anon;
grant execute on function public.list_matches() to authenticated;

-- --------------------------------------------------------- mark_matches_seen
-- Même construction auditée que record_underage_attempt : zéro paramètre,
-- effets strictement bornés à auth.uid() (uniquement SON côté seen_at).
create or replace function public.mark_matches_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.matches m
     set user_a_seen_at = case when m.user_a = auth.uid()
                               then coalesce(m.user_a_seen_at, now())
                               else m.user_a_seen_at end,
         user_b_seen_at = case when m.user_b = auth.uid()
                               then coalesce(m.user_b_seen_at, now())
                               else m.user_b_seen_at end
   where (m.user_a = auth.uid() or m.user_b = auth.uid())
     and m.status = 'active'
     and (   (m.user_a = auth.uid() and m.user_a_seen_at is null)
          or (m.user_b = auth.uid() and m.user_b_seen_at is null));
$$;

revoke all on function public.mark_matches_seen() from public;
revoke execute on function public.mark_matches_seen() from anon;
grant execute on function public.mark_matches_seen() to authenticated;
