"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/guards";

/**
 * Unmatch : transition status='unmatched'. La RLS (0001) garantit que seul
 * un participant peut la déclencher, et la révocation column-level (0006)
 * que seule la colonne status est modifiable. Idempotent : un match déjà
 * unmatché (course avec l'autre participant) est un no-op silencieux.
 */
export async function unmatch(formData: FormData): Promise<void> {
  const { supabase } = await requireActiveMember();

  const parsed = z.uuid().safeParse(formData.get("matchId"));
  if (!parsed.success) return;

  await supabase
    .from("matches")
    .update({ status: "unmatched" })
    .eq("id", parsed.data)
    .eq("status", "active");
  // Erreur RLS (non-participant…) volontairement silencieuse : aucun message
  // ne doit révéler l'existence ou non d'un match d'autrui.

  revalidatePath("/matches");
}

/** Marque tous mes matches comme vus (badge header remis à zéro). */
export async function markMatchesSeen(): Promise<void> {
  const { supabase } = await requireActiveMember();
  await supabase.rpc("mark_matches_seen");
}
