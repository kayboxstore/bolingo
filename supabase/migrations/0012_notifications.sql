-- ============================================================================
-- Bolingo — notifications in-app (nouveau match / nouveau message)
--
-- ⚠️ FICHIER UNIQUEMENT : à appliquer via `supabase db push`.
--
-- Web uniquement (push mobile/email hors périmètre). Génération par triggers
-- DB ; livraison temps réel via le proxy SSE serveur (même pattern que la
-- messagerie — le navigateur est anon-only). Aucun contenu de message n'est
-- dupliqué : une notif ne stocke que le type + l'acteur + la réf. du match ;
-- le texte affiché est dérivé à la lecture.
-- ============================================================================

-- Idempotent (rejouable, y compris via le SQL Editor) : CREATE TYPE n'a pas de
-- `if not exists` natif → DO block qui avale le doublon.
do $$ begin
  create type notification_type as enum ('new_match', 'new_message');
exception when duplicate_object then null;
end $$;

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  type         notification_type not null,
  actor_id     uuid references public.users(id) on delete cascade,  -- l'autre user
  match_id     uuid references public.matches(id) on delete cascade, -- cible du lien
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
-- created_at + id : keyset avec départage (created_at seul saute une ligne si
-- deux notifs partagent le même instant — cf. messages_page 0007).
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc, id desc);
create index if not exists notifications_unread_idx
  on public.notifications (recipient_id) where read_at is null;
-- Collapse : au plus UNE notif message non lue par (destinataire, conversation).
-- UNIQUE → le ON CONFLICT de notify_new_message est réellement race-safe.
create unique index if not exists notifications_msg_open_idx
  on public.notifications (recipient_id, match_id)
  where type = 'new_message' and read_at is null;

-- ------------------------------------------------------------------- RLS
alter table public.notifications enable row level security;
-- Lecture : ses propres notifications uniquement. Écriture réservée aux triggers
-- / RPC DEFINER (aucune policy insert/update/delete → PostgREST refuse ; les
-- DEFINER, propriétaires, passent). On révoque aussi au niveau table.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using ((select auth.uid()) = recipient_id);
revoke insert, update, delete on table public.notifications from authenticated, anon;

-- ------------------------------------------------ génération : nouveau match
-- AFTER INSERT sur matches (créé par le trigger DEFINER handle_new_like, insert
-- idempotent → une seule fois par paire → pas de double notification). Une notif
-- pour chaque participant, l'acteur étant l'autre.
create or replace function public.notify_new_match()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, type, actor_id, match_id)
  values
    (new.user_a, 'new_match', new.user_b, new.id),
    (new.user_b, 'new_match', new.user_a, new.id);
  return new;
end;
$$;
revoke execute on function public.notify_new_match() from public, anon, authenticated;

drop trigger if exists matches_notify_new_match on public.matches;
create trigger matches_notify_new_match
  after insert on public.matches
  for each row execute function public.notify_new_match();

-- ---------------------------------------------- génération : nouveau message
-- AFTER INSERT sur messages. Une notif pour le DESTINATAIRE (l'autre participant
-- du match), sauf si :
--   * le match n'est pas actif, ou blocage mutuel, ou destinataire inactif ;
--   * le destinataire est en train de regarder (last_read_at < 15 s) ;
--   * il existe déjà une notif message NON LUE pour cette conversation (collapse
--     → pas de spam de 10 notifs pour 10 messages ; la prochaine notif n'arrive
--     qu'après lecture).
create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_recipient uuid;
  v_last_read timestamptz;
begin
  select case when m.user_a = new.sender_id then m.user_b else m.user_a end
    into v_recipient
  from public.matches m
  where m.id = new.match_id and m.status = 'active';

  if v_recipient is null then
    return new;  -- match inactif / introuvable
  end if;
  if private.blocks_between(new.sender_id, v_recipient)
     or not private.user_is_active(v_recipient) then
    return new;
  end if;

  select mr.last_read_at into v_last_read
  from public.match_reads mr
  where mr.match_id = new.match_id and mr.user_id = v_recipient;
  if v_last_read is not null
     and v_last_read >= new.created_at - interval '15 seconds' then
    return new;  -- destinataire actif dans la conversation
  end if;

  -- Collapse race-safe : l'index partiel unique (recipient_id, match_id) where
  -- type='new_message' and read_at is null garantit au plus une notif message
  -- non lue par conversation, même sous insertions concurrentes.
  insert into public.notifications (recipient_id, type, actor_id, match_id)
  values (v_recipient, 'new_message', new.sender_id, new.match_id)
  on conflict (recipient_id, match_id) where (type = 'new_message' and read_at is null)
  do nothing;
  return new;
end;
$$;
revoke execute on function public.notify_new_message() from public, anon, authenticated;

drop trigger if exists messages_notify_new_message on public.messages;
create trigger messages_notify_new_message
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- --------------------------------- clear : lecture d'une conversation → lues
-- Quand le curseur de lecture d'un participant avance (ouverture / défilement),
-- on marque lues les notifs message de cette conversation. Couvre le cas de
-- l'onglet resté ouvert (au-delà de la fenêtre 15 s du trigger de génération).
create or replace function public.notif_clear_on_read()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.notifications
     set read_at = now()
   where recipient_id = new.user_id
     and match_id = new.match_id
     and type = 'new_message'
     and read_at is null;
  return new;
end;
$$;
revoke execute on function public.notif_clear_on_read() from public, anon, authenticated;

drop trigger if exists match_reads_notif_clear on public.match_reads;
create trigger match_reads_notif_clear
  after insert or update on public.match_reads
  for each row execute function public.notif_clear_on_read();

-- ----------------------------------------------------------- RPC de lecture
-- Filtre de visibilité commun : masque les notifs dont l'acteur est
-- suspendu/supprimé (user_is_active) ou bloqué (blocks_between). Les notifs de
-- conversations unmatchées restent visibles (match_active=false → lien dégradé
-- côté app, pas de 404).
create or replace function public.list_notifications(
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 20
)
returns table (
  id uuid,
  type notification_type,
  actor_id uuid,
  actor_name text,
  actor_photo_path text,
  match_id uuid,
  match_active boolean,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  return query
    select
      n.id, n.type, n.actor_id, ap.display_name, photo.storage_path,
      n.match_id, (m.status = 'active') as match_active, n.created_at, n.read_at
    from public.notifications n
    left join public.matches m on m.id = n.match_id
    left join public.profiles ap on ap.user_id = n.actor_id
    left join lateral (
      select pp.storage_path from public.profile_photos pp
      where pp.user_id = n.actor_id and pp.moderation_status = 'approved'
      order by pp.position limit 1
    ) photo on true
    where n.recipient_id = auth.uid()
      and (
        n.actor_id is null
        or (private.user_is_active(n.actor_id)
            and not private.blocks_between(auth.uid(), n.actor_id))
      )
      -- Keyset avec départage (created_at, id) : pas de ligne sautée si deux
      -- notifs partagent le même instant.
      and (
        p_before_created_at is null
        or (n.created_at, n.id) < (p_before_created_at, p_before_id)
      )
    order by n.created_at desc, n.id desc
    limit least(greatest(p_limit, 1), 50);
end;
$$;
revoke all on function public.list_notifications(timestamptz, uuid, int) from public;
revoke execute on function public.list_notifications(timestamptz, uuid, int) from anon;
grant execute on function public.list_notifications(timestamptz, uuid, int) to authenticated;

-- Compteur non-lu (badge), même filtre de visibilité.
create or replace function public.unread_notifications_count()
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.notifications n
  where n.recipient_id = auth.uid()
    and n.read_at is null
    and (
      n.actor_id is null
      or (private.user_is_active(n.actor_id)
          and not private.blocks_between(auth.uid(), n.actor_id))
    );
$$;
revoke all on function public.unread_notifications_count() from public;
revoke execute on function public.unread_notifications_count() from anon;
grant execute on function public.unread_notifications_count() to authenticated;

-- Marquer tout lu (ouverture du centre de notifications).
create or replace function public.mark_notifications_read()
returns void
language sql security definer set search_path = '' as $$
  update public.notifications
     set read_at = now()
   where recipient_id = auth.uid() and read_at is null;
$$;
revoke all on function public.mark_notifications_read() from public;
revoke execute on function public.mark_notifications_read() from anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- Marquer une notif lue (clic individuel).
create or replace function public.mark_notification_read(p_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.notifications
     set read_at = now()
   where id = p_id and recipient_id = auth.uid() and read_at is null;
$$;
revoke all on function public.mark_notification_read(uuid) from public;
revoke execute on function public.mark_notification_read(uuid) from anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- ------------------------------------------------------ publication Realtime
-- INSERT filtré par recipient_id côté proxy SSE (pas de REPLICA IDENTITY FULL :
-- les événements INSERT portent déjà toute la ligne). Gardé idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
