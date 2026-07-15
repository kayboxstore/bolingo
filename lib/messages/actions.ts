"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/guards";
import { MESSAGE_MAX } from "@/lib/messages/constants";
import { loadMessages } from "@/lib/messages/queries";
import type { ChatMessage, MessageCursor } from "@/lib/messages/types";

const sendSchema = z.object({
  matchId: z.uuid(),
  content: z.string().trim().min(1).max(MESSAGE_MAX),
  clientId: z.uuid(),
});

export type SendResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; reason: "invalid" | "unavailable" | "rate_limited" | "error" };

/**
 * Envoie un message. IDEMPOTENT via client_id (unique partiel sender_id,
 * client_id) : un renvoi après timeout réseau retombe sur la ligne existante.
 * La RLS messages_insert impose match actif + participant + pas de blocage —
 * un envoi vers un match unmatché/bloqué entre-temps échoue proprement.
 */
export async function sendMessage(
  matchId: string,
  content: string,
  clientId: string,
): Promise<SendResult> {
  const { supabase, user } = await requireActiveMember();

  const parsed = sendSchema.safeParse({ matchId, content, clientId });
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const { data, error } = await supabase
    .from("messages")
    .insert({
      match_id: parsed.data.matchId,
      sender_id: user.id,
      content: parsed.data.content,
      client_id: parsed.data.clientId,
    })
    .select("id, sender_id, content, deleted_at, created_at")
    .single();

  if (error) {
    // Renvoi idempotent : la ligne existe déjà → on la récupère.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("messages")
        .select("id, sender_id, content, deleted_at, created_at")
        .eq("sender_id", user.id)
        .eq("client_id", parsed.data.clientId)
        .maybeSingle();
      if (existing) return { ok: true, message: toChat(existing) };
    }
    if (error.code === "P0001") return { ok: false, reason: "rate_limited" };
    if (error.code === "42501") return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  }

  revalidatePath("/messages");
  return { ok: true, message: toChat(data) };
}

/** Soft-delete d'un message par son auteur (RLS + grant update(deleted_at)). */
export async function deleteMessage(
  matchId: string,
  messageId: string,
): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireActiveMember();
  const parsed = z
    .object({ matchId: z.uuid(), messageId: z.uuid() })
    .safeParse({ matchId, messageId });
  if (!parsed.success) return { ok: false };

  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.messageId)
    .eq("sender_id", user.id) // ceinture ; la RLS l'impose déjà
    .is("deleted_at", null);

  return { ok: !error };
}

/** Marque la conversation comme lue jusqu'à maintenant (indicateur « vu »). */
export async function markConversationRead(matchId: string): Promise<void> {
  const { supabase, user } = await requireActiveMember();
  if (!z.uuid().safeParse(matchId).success) return;

  await supabase.from("match_reads").upsert(
    {
      match_id: matchId,
      user_id: user.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "match_id,user_id" },
  );
}

/** Page plus ancienne (pagination vers le haut). RLS-protégée. */
export async function loadOlderMessages(
  matchId: string,
  before: MessageCursor,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  await requireActiveMember();
  if (!z.uuid().safeParse(matchId).success) {
    return { messages: [], hasMore: false };
  }
  return loadMessages(matchId, before);
}

function toChat(row: {
  id: string;
  sender_id: string;
  content: string;
  deleted_at: string | null;
  created_at: string;
}): ChatMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    content: row.deleted_at ? "" : row.content,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}
