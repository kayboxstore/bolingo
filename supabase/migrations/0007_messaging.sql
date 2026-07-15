-- ============================================================================
-- Bolingo — messaging (chat entre matchs)
--
-- ⚠️ FICHIER UNIQUEMENT : à appliquer par l'utilisateur via `supabase db push`
-- (règle CLAUDE.md — aucune écriture sur le projet réel sans confirmation).
--
-- Le socle existe déjà (0001) : table `messages`, `match_reads`, index keyset,
-- et RLS conditionnée à « match actif + participant » (donc l'unmatch coupe
-- déjà la conversation). Cette migration :
--   * idempotence d'envoi (client_id + unique partiel) — anti-doublon réseau
--   * écriture verrouillée à deux colonnes : insert du contenu, soft-delete
--   * anti-message-vide + rate limiting côté serveur (triggers)
--   * blocage mutuel post-match → conversation inaccessible (RLS)
--   * RPC list_conversations() + other_last_read() (pattern DEFINER sanctionné)
--   * publication Realtime sur `messages`
-- ============================================================================

-- ------------------------------------------------------- idempotence d'envoi
-- Jeton client optionnel : un renvoi après timeout réseau ne crée pas de
-- doublon (l'INSERT retombe sur ON CONFLICT côté action).
alter table public.messages
  add column if not exists client_id uuid;
create unique index if not exists messages_sender_client_id_key
  on public.messages (sender_id, client_id)
  where client_id is not null;

-- Index du trigger de rate-limit : sans lui, `count(*) where sender_id= and
-- created_at > now()-10s` fait un Seq Scan de toute la table `messages` à
-- CHAQUE envoi (chemin le plus chaud). (audit database-architect 🔴)
create index if not exists messages_rate_limit_idx
  on public.messages (sender_id, created_at desc);

-- --------------------------------------------------------- écriture verrouillée
-- Le client ne peut écrire que le contenu (INSERT) et le soft-delete (deleted_at
-- via UPDATE) — jamais éditer un message existant ni réécrire sender/match.
revoke insert, update on table public.messages from authenticated, anon;
grant insert (match_id, sender_id, content, client_id) on table public.messages to authenticated;
grant update (deleted_at) on table public.messages to authenticated;

-- ------------------------------------------------ anti-message-vide (serveur)
-- Le CHECK char_length >= 1 (0001) laisse passer les espaces seuls. On trim et
-- on rejette le vide au niveau base, quel que soit le chemin d'écriture.
create or replace function public.messages_normalize()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.content := btrim(new.content);
  if new.content = '' then
    raise exception 'empty message' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_normalize_before_insert on public.messages;
create trigger messages_normalize_before_insert
  before insert on public.messages
  for each row execute function public.messages_normalize();

-- --------------------------------------------------- rate limiting (serveur)
-- Fenêtre glissante : au plus 10 messages / 10 s par expéditeur. Robuste même
-- en appel PostgREST direct (le trigger s'exécute quoi qu'il arrive).
create or replace function public.messages_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recent integer;
begin
  select count(*) into recent
  from public.messages m
  where m.sender_id = new.sender_id
    and m.created_at > now() - interval '10 seconds';
  if recent >= 10 then
    raise exception 'rate limit exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_rate_limit_before_insert on public.messages;
create trigger messages_rate_limit_before_insert
  before insert on public.messages
  for each row execute function public.messages_rate_limit();

-- --------------------------------------------- blocage post-match → coupure
-- Un blocage mutuel rend la conversation inaccessible (au-delà de l'unmatch).
-- On recrée les policies 0001 en ajoutant la condition blocks_between.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and m.status = 'active'
        and ((select auth.uid()) = m.user_a or (select auth.uid()) = m.user_b)
        and not public.blocks_between(m.user_a, m.user_b)
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.status = 'active'
        and ((select auth.uid()) = m.user_a or (select auth.uid()) = m.user_b)
        and not public.blocks_between(m.user_a, m.user_b)
    )
  );

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages
  for update using ((select auth.uid()) = sender_id)
  with check ((select auth.uid()) = sender_id);

-- Soft-delete définitif : interdit le « un-delete » (deleted_at non-null → null)
-- même via un appel PostgREST direct de l'auteur. (audit database-architect ⚠️)
create or replace function public.messages_no_undelete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'cannot restore a deleted message'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_no_undelete_before_update on public.messages;
create trigger messages_no_undelete_before_update
  before update on public.messages
  for each row execute function public.messages_no_undelete();

-- --------------------------------------------------------- other_last_read()
-- « Vu » : le dernier last_read_at de l'AUTRE participant. match_reads_own
-- (0001) n'autorise que la lecture de SA propre ligne — d'où ce DEFINER borné
-- au match de l'appelant. Ne révèle rien d'un tiers : uniquement le pair d'un
-- match actif dont l'appelant fait partie.
create or replace function public.other_last_read(p_match_id uuid)
returns timestamptz
language sql stable security definer set search_path = '' as $$
  select mr.last_read_at
  from public.matches m
  join public.match_reads mr
    on mr.match_id = m.id
   and mr.user_id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  where m.id = p_match_id
    and m.status = 'active'
    and (m.user_a = auth.uid() or m.user_b = auth.uid());
$$;
revoke all on function public.other_last_read(uuid) from public;
revoke execute on function public.other_last_read(uuid) from anon;
grant execute on function public.other_last_read(uuid) to authenticated;

-- ------------------------------------------------------- list_conversations()
-- Liste des conversations (matchs actifs), triée par dernière activité.
-- Source : matches + messages + match_reads (pas de fuite de like/tiers).
create or replace function public.list_conversations()
returns table (
  match_id uuid,
  other_user_id uuid,
  display_name text,
  photo_path text,
  last_message text,
  last_message_deleted boolean,
  last_message_at timestamptz,
  last_activity timestamptz,
  unread_count integer,
  profile_available boolean
)
language sql stable security definer set search_path = '' as $$
  select
    m.id as match_id,
    case when m.user_a = auth.uid() then m.user_b else m.user_a end as other_user_id,
    p.display_name,
    photo.storage_path as photo_path,
    last_msg.content as last_message,
    (last_msg.deleted_at is not null) as last_message_deleted,
    last_msg.created_at as last_message_at,
    coalesce(last_msg.created_at, m.created_at) as last_activity,
    (
      select count(*)::integer
      from public.messages um
      where um.match_id = m.id
        and um.sender_id <> auth.uid()
        and um.deleted_at is null
        and um.created_at > coalesce(mr.last_read_at, 'epoch'::timestamptz)
    ) as unread_count,
    (p.user_id is not null) as profile_available
  from public.matches m
  left join public.profiles p
    on p.user_id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
   and p.is_visible and p.deleted_at is null
   and exists (select 1 from public.users u where u.id = p.user_id and u.status = 'active')
  left join public.match_reads mr
    on mr.match_id = m.id and mr.user_id = auth.uid()
  left join lateral (
    select pp.storage_path
    from public.profile_photos pp
    where pp.user_id = p.user_id and pp.moderation_status = 'approved'
    order by pp.position limit 1
  ) photo on true
  left join lateral (
    select msg.content, msg.deleted_at, msg.created_at
    from public.messages msg
    where msg.match_id = m.id
    order by msg.created_at desc, msg.id desc
    limit 1
  ) last_msg on true
  where (m.user_a = auth.uid() or m.user_b = auth.uid())
    and m.status = 'active'
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
         or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
    )
  order by coalesce(last_msg.created_at, m.created_at) desc;
$$;
revoke all on function public.list_conversations() from public;
revoke execute on function public.list_conversations() from anon;
grant execute on function public.list_conversations() to authenticated;

-- --------------------------------------------------------------- messages_page
-- Pagination keyset par COMPARAISON DE TUPLE (created_at, id) < curseur, seek
-- direct dans messages_keyset_idx — évite la forme OR de PostgREST qui force
-- un Bitmap+Sort croissant avec la profondeur. SECURITY INVOKER → la RLS
-- messages s'applique (accès borné aux participants du match actif).
-- (audit database-architect ⚠️)
create or replace function public.messages_page(
  p_match_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns setof public.messages
language sql stable set search_path = '' as $$
  select *
  from public.messages
  where match_id = p_match_id
    and (
      p_before_created_at is null
      or (created_at, id) < (p_before_created_at, p_before_id)
    )
  order by created_at desc, id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
revoke all on function public.messages_page(uuid, timestamptz, uuid, integer) from public;
revoke execute on function public.messages_page(uuid, timestamptz, uuid, integer) from anon;
grant execute on function public.messages_page(uuid, timestamptz, uuid, integer) to authenticated;

-- ----------------------------------------------------------------- Realtime
-- Le proxy SSE serveur s'abonne aux changements de `messages`. L'identité de
-- réplication par défaut (PK) suffit : match_id est immuable (pas de grant
-- update dessus), donc toujours présent dans la nouvelle image de ligne des
-- événements INSERT/UPDATE qui sert au filtrage — pas de REPLICA IDENTITY FULL
-- (surcoût WAL inutile). (audit database-architect ⚠️)
-- Ajout à la publication, gardé pour la ré-exécution du fichier.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
