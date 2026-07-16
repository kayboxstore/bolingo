import { createClient } from "@/lib/supabase/server";

export type NotificationType = "new_match" | "new_message";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  actorId: string | null;
  actorName: string | null;
  actorPhotoUrl: string | null;
  matchId: string | null;
  matchActive: boolean;
  createdAt: string;
  read: boolean;
};

type NotificationRow = {
  id: string;
  type: NotificationType;
  actor_id: string | null;
  actor_name: string | null;
  actor_photo_path: string | null;
  match_id: string | null;
  match_active: boolean;
  created_at: string;
  read_at: string | null;
};

export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Compteur non-lu (badge de l'en-tête). RPC DEFINER, borné à auth.uid(). */
export async function unreadNotificationsCount(): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase.rpc("unread_notifications_count");
  return typeof data === "number" ? data : 0;
}

export type NotificationCursor = { createdAt: string; id: string };

/**
 * Page de notifications (RPC DEFINER list_notifications, keyset (created_at, id)).
 * La RPC masque déjà les notifs dont l'acteur est suspendu/supprimé/bloqué.
 * `cursor` = (created_at, id) de la dernière notif affichée (pagination).
 */
export async function loadNotifications(cursor?: NotificationCursor): Promise<{
  items: NotificationItem[];
  hasMore: boolean;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_notifications", {
    p_before_created_at: cursor?.createdAt ?? undefined,
    p_before_id: cursor?.id ?? undefined,
    p_limit: NOTIFICATIONS_PAGE_SIZE,
  });
  if (error || !data) return { items: [], hasMore: false };
  const rows = data as NotificationRow[];

  const paths = rows
    .map((r) => r.actor_photo_path)
    .filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage
      .from("profile-photos")
      .createSignedUrls(paths, 900);
    urls?.forEach((u, i) => u.signedUrl && signed.set(paths[i], u.signedUrl));
  }

  const items = rows.map((r) => ({
    id: r.id,
    type: r.type,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorPhotoUrl: r.actor_photo_path
      ? (signed.get(r.actor_photo_path) ?? null)
      : null,
    matchId: r.match_id,
    matchActive: r.match_active,
    createdAt: r.created_at,
    read: r.read_at !== null,
  }));

  return { items, hasMore: rows.length === NOTIFICATIONS_PAGE_SIZE };
}
