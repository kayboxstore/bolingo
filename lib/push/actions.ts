"use server";

import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/guards";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(200),
  userAgent: z.string().max(300).optional(),
});

export type PushSubscriptionInput = z.infer<typeof subscriptionSchema>;

/**
 * Enregistre l'abonnement Web Push de l'appareil courant. Passe par la RPC
 * DEFINER save_push_subscription (invariant « 1 endpoint = son propriétaire
 * courant », race-safe) ; l'appelant ne peut abonner que lui-même (owner =
 * auth.uid() côté RPC, non paramétrable). Compte inactif → refus côté RPC.
 */
export async function savePushSubscription(
  input: PushSubscriptionInput,
): Promise<{ ok: boolean }> {
  const { supabase } = await requireActiveMember();

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
    p_user_agent: parsed.data.userAgent ?? null,
  });
  return { ok: !error };
}

/**
 * Désinscrit l'appareil courant (par endpoint). RLS delete-own : un utilisateur
 * ne peut supprimer que ses propres abonnements ; les autres appareils du compte
 * continuent de recevoir normalement.
 */
export async function deletePushSubscription(
  endpoint: string,
): Promise<{ ok: boolean }> {
  const { supabase } = await requireActiveMember();

  const parsed = z.string().url().max(1000).safeParse(endpoint);
  if (!parsed.success) return { ok: false };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data);
  return { ok: !error };
}
