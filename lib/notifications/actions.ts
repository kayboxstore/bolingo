"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/guards";
import { loadNotifications, type NotificationItem } from "@/lib/notifications/queries";

const cursorSchema = z.object({
  createdAt: z.string().min(1).max(40),
  id: z.uuid(),
});

/** Pagination du centre de notifications (keyset (created_at, id)). */
export async function fetchMoreNotifications(cursor: {
  createdAt: string;
  id: string;
}): Promise<{ items: NotificationItem[]; hasMore: boolean }> {
  await requireActiveMember();
  // Curseur d'origine serveur ; le cast timestamptz de la RPC valide le format.
  const parsed = cursorSchema.safeParse(cursor);
  if (!parsed.success) return { items: [], hasMore: false };
  return loadNotifications(parsed.data);
}

/** Marque toutes les notifications de l'utilisateur comme lues (ouverture du centre). */
export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const { supabase } = await requireActiveMember();
  const { error } = await supabase.rpc("mark_notifications_read");
  revalidatePath("/notifications");
  return { ok: !error };
}

/**
 * Clic sur une notification : marque cette notif lue et résout une cible SÛRE au
 * moment du clic (le match peut avoir disparu depuis). Match actif → la
 * conversation ; sinon → la liste des matches (jamais de 404 brute).
 */
export async function openNotification(
  id: string,
): Promise<{ ok: boolean; target: string }> {
  const { supabase, user } = await requireActiveMember();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, target: "/notifications" };

  await supabase.rpc("mark_notification_read", { p_id: parsed.data });

  // Cible résolue à l'instant du clic. Filtre recipient_id explicite (défense en
  // profondeur, en plus de la RLS notifications_select_own).
  const { data: notif } = await supabase
    .from("notifications")
    .select("match_id")
    .eq("id", parsed.data)
    .eq("recipient_id", user.id)
    .maybeSingle();

  let target = "/notifications";
  const matchId = notif?.match_id as string | null | undefined;
  if (matchId) {
    const { data: activeMatch } = await supabase
      .from("matches")
      .select("id")
      .eq("id", matchId)
      .eq("status", "active")
      .maybeSingle();
    target = activeMatch ? `/messages/${matchId}` : "/matches";
  }

  revalidatePath("/notifications");
  return { ok: true, target };
}
