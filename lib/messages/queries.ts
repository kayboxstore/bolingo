import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/lib/messages/constants";
import type {
  ChatMessage,
  ConversationHeader,
  ConversationSummary,
  MessageCursor,
} from "@/lib/messages/types";

type ConversationRow = {
  match_id: string;
  other_user_id: string;
  display_name: string | null;
  photo_path: string | null;
  last_message: string | null;
  last_message_deleted: boolean;
  last_message_at: string | null;
  unread_count: number;
  profile_available: boolean;
};

/** Liste des conversations, triée par dernière activité (RPC DEFINER). */
export async function loadConversations(): Promise<ConversationSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_conversations");
  if (error || !data) return [];
  const rows = data as ConversationRow[];

  const paths = rows
    .map((r) => r.photo_path)
    .filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage
      .from("profile-photos")
      .createSignedUrls(paths, 900);
    urls?.forEach((u, i) => u.signedUrl && signed.set(paths[i], u.signedUrl));
  }

  return rows.map((r) => ({
    matchId: r.match_id,
    otherUserId: r.other_user_id,
    displayName: r.display_name,
    photoUrl: r.photo_path ? (signed.get(r.photo_path) ?? null) : null,
    lastMessage: r.last_message,
    lastMessageDeleted: r.last_message_deleted,
    lastMessageAt: r.last_message_at,
    unreadCount: r.unread_count,
    profileAvailable: r.profile_available,
  }));
}

/**
 * En-tête d'une conversation : identité de l'autre + statut actif. Renvoie
 * null si le match n'existe pas / n'est pas actif / n'appartient pas à
 * l'appelant (la RLS matches filtre déjà — pas d'oracle d'existence).
 */
export async function loadConversationHeader(
  matchId: string,
): Promise<ConversationHeader | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: match } = await supabase
    .from("matches")
    .select("id, user_a, user_b")
    .eq("id", matchId)
    .eq("status", "active")
    .maybeSingle();
  if (!match) return null;

  const otherUserId = match.user_a === user.id ? match.user_b : match.user_a;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, primary_photo_path")
    .eq("user_id", otherUserId)
    .maybeSingle();

  let photoUrl: string | null = null;
  if (profile?.primary_photo_path) {
    const { data: urls } = await supabase.storage
      .from("profile-photos")
      .createSignedUrls([profile.primary_photo_path], 900);
    photoUrl = urls?.[0]?.signedUrl ?? null;
  }

  return {
    matchId,
    otherUserId,
    displayName: profile?.display_name ?? null,
    photoUrl,
    active: true,
  };
}

/**
 * Page d'historique (keyset, du plus récent au plus ancien). `before` =
 * curseur pour charger vers le haut. La RLS messages garantit l'accès
 * (match actif + participant + pas de blocage).
 */
export async function loadMessages(
  matchId: string,
  before?: MessageCursor,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const supabase = createClient();

  let query = supabase
    .from("messages")
    .select("id, sender_id, content, deleted_at, created_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (before) {
    query = query.or(
      `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`,
    );
  }

  const { data, error } = await query;
  if (error || !data) return { messages: [], hasMore: false };

  const hasMore = data.length > PAGE_SIZE;
  const rows = hasMore ? data.slice(0, PAGE_SIZE) : data;
  const messages: ChatMessage[] = rows
    .map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      content: m.deleted_at ? "" : m.content,
      deletedAt: m.deleted_at,
      createdAt: m.created_at,
    }))
    .reverse();

  return { messages, hasMore };
}

/** Dernier `last_read_at` de l'autre participant (pour le statut « vu »). */
export async function otherLastRead(matchId: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.rpc("other_last_read", {
    p_match_id: matchId,
  });
  return (data as string | null) ?? null;
}
