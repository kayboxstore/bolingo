"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/guards";

/**
 * Bascule la visibilité du profil dans la découverte. Un profil masqué
 * (`is_visible = false`) sort du feed et des helpers de visibilité
 * (profile_publicly_visible) : plus personne ne peut le découvrir, mais les
 * matches et conversations existants subsistent.
 */
export async function setVisibility(
  visible: boolean,
): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireActiveMember();
  const parsed = z.boolean().safeParse(visible);
  if (!parsed.success) return { ok: false };

  const { error } = await supabase
    .from("profiles")
    .update({ is_visible: parsed.data })
    .eq("user_id", user.id);

  revalidatePath("/settings");
  return { ok: !error };
}
