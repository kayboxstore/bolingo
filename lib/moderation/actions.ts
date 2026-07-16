"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/guards";
import {
  REPORT_CATEGORIES,
  REPORT_DETAILS_MAX,
  type ReportCategory,
} from "@/lib/moderation/constants";

/**
 * Bloque un utilisateur. Idempotent (contrainte unique blocker/blocked →
 * ignoreDuplicates). L'effet (masquage découverte/matches/messagerie) est
 * déjà porté par blocks_between. La RLS blocks_own impose blocker_id = auth.uid().
 */
export async function blockUser(targetId: string): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireActiveMember();
  const parsed = z.uuid().safeParse(targetId);
  if (!parsed.success || parsed.data === user.id) return { ok: false };

  const { error } = await supabase
    .from("blocks")
    .upsert(
      { blocker_id: user.id, blocked_id: parsed.data },
      { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
    );

  revalidatePath("/discover");
  revalidatePath("/matches");
  revalidatePath("/messages");
  revalidatePath("/settings");
  return { ok: !error };
}

/** Débloque un utilisateur (réaffiche match/conversation le cas échéant). */
export async function unblockUser(targetId: string): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireActiveMember();
  const parsed = z.uuid().safeParse(targetId);
  if (!parsed.success) return { ok: false };

  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", parsed.data);

  // Débloquer restaure la visibilité du match/de la conversation (blocks_between
  // les filtrait) : invalider les 4 surfaces, symétriquement à blockUser.
  revalidatePath("/discover");
  revalidatePath("/matches");
  revalidatePath("/messages");
  revalidatePath("/settings");
  return { ok: !error };
}

const reportSchema = z.object({
  reportedId: z.uuid(),
  category: z.enum(REPORT_CATEGORIES),
  details: z.string().trim().max(REPORT_DETAILS_MAX).optional(),
  messageId: z.uuid().optional(),
});

export type ReportResult = { ok: boolean; error?: string };

/**
 * Signale un utilisateur (RPC DEFINER submit_report : snapshot du handle,
 * validation de la preuve, dédup anti-spam). Le contenu est stocké, jamais
 * exposé au signalé.
 */
export async function submitReport(input: {
  reportedId: string;
  category: ReportCategory;
  details?: string;
  messageId?: string;
}): Promise<ReportResult> {
  const { supabase, user } = await requireActiveMember();

  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Signalement invalide." };
  if (parsed.data.reportedId === user.id) return { ok: false, error: "Signalement invalide." };

  const { error } = await supabase.rpc("submit_report", {
    p_reported: parsed.data.reportedId,
    p_category: parsed.data.category,
    p_details: parsed.data.details ?? null,
    p_message_id: parsed.data.messageId ?? null,
  });
  if (error) return { ok: false, error: "Une erreur est survenue. Réessaie." };

  return { ok: true };
}
