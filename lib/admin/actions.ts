"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";

const resolveSchema = z.object({
  reportId: z.uuid(),
  action: z.enum(["dismiss", "warn", "suspend"]),
});

/**
 * Action sur un signalement (RPC DEFINER admin_resolve_report). L'RPC re-vérifie
 * is_admin, met le report à jour de façon idempotente, et suspend le compte
 * signalé pour l'action « suspend ». Le guard requireAdmin masque la route.
 */
export async function resolveReport(input: {
  reportId: string;
  action: "dismiss" | "warn" | "suspend";
}): Promise<{ ok: boolean }> {
  const { supabase } = await requireAdmin();
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const { error } = await supabase.rpc("admin_resolve_report", {
    p_id: parsed.data.reportId,
    p_action: parsed.data.action,
  });
  if (error) {
    console.error("admin_resolve_report failed", error.message);
    return { ok: false };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/reports/${parsed.data.reportId}`);
  revalidatePath("/admin/accounts");
  return { ok: true };
}

const statusSchema = z.object({
  userId: z.uuid(),
  suspend: z.boolean(),
});

/** Suspendre / réactiver un compte (RPC DEFINER admin_set_account_status). */
export async function setAccountStatus(input: {
  userId: string;
  suspend: boolean;
}): Promise<{ ok: boolean }> {
  const { supabase } = await requireAdmin();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const { error } = await supabase.rpc("admin_set_account_status", {
    p_user: parsed.data.userId,
    p_suspend: parsed.data.suspend,
  });
  if (error) {
    console.error("admin_set_account_status failed", error.message);
    return { ok: false };
  }

  revalidatePath("/admin/accounts");
  revalidatePath("/admin");
  // Le statut du compte s'affiche aussi sur le détail d'un signalement le visant.
  revalidatePath("/admin/reports/[id]", "page");
  return { ok: true };
}
