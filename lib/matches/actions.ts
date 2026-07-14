"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Garde commune : authentifié, vérifié, actif, profil complet, non flagué. */
async function requireMatchUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/verify-email");

  const [{ data: account }, { data: profile }] = await Promise.all([
    supabase
      .from("users")
      .select("underage_attempted_at, status")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (account?.underage_attempted_at) redirect("/onboarding/blocked");
  if (account && account.status !== "active") {
    await supabase.auth.signOut();
    redirect("/login");
  }
  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  return { supabase, user };
}

/**
 * Unmatch : transition status='unmatched'. La RLS (0001) garantit que seul
 * un participant peut la déclencher, et la révocation column-level (0006)
 * que seule la colonne status est modifiable. Idempotent : un match déjà
 * unmatché (course avec l'autre participant) est un no-op silencieux.
 */
export async function unmatch(formData: FormData): Promise<void> {
  const { supabase } = await requireMatchUser();

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
  const { supabase } = await requireMatchUser();
  await supabase.rpc("mark_matches_seen");
}
