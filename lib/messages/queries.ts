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

  // Même filtre de visibilité que list_conversations/discover : un profil
  // masqué/supprimé/suspendu n'expose pas de données obsolètes (la RLS
  // profiles_select le filtre déjà — ici on distingue le cas pour l'UI).
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
    profileAvailable: Boolean(profile),
  };
}

/**
 * Page d'historique (keyset, du plus récent au plus ancien). `before` =
 * curseur pour charger vers le haut. La RLS messages garantit l'accès
 * (match actif + participant + pas de blocage).
 */
type MessageRow = {
  id: string;
  sender_id: string;
  content: string;
  deleted_at: string | null;
  created_at: string;
};

export async function loadMessages(
  matchId: string,
  before?: MessageCursor,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const supabase = createClient();

  // RPC à comparaison de tuple (seek direct dans messages_keyset_idx).
  const { data, error } = await supabase.rpc("messages_page", {
    p_match_id: matchId,
    p_before_created_at: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
    p_limit: PAGE_SIZE + 1,
  });
  if (error || !data) return { messages: [], hasMore: false };

  const rows = data as MessageRow[];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const messages: ChatMessage[] = page
    .map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      content: m.deleted_at ? "" : m.content,
      deletedAt: m.deleted_at,
      createdAt: m.created_at,
    }))
    .reverse(); // desc → asc (ordre d'affichage)

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
