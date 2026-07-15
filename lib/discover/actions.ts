"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadDiscoveryBatch, type DiscoveryBatch } from "@/lib/discover/queries";

/**
 * Garde des actions de découverte : authentifié, vérifié, compte actif,
 * profil COMPLET (prérequis produit), pas de blocage mineur.
 */
async function requireDiscoveryUser() {
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

const verdictSchema = z.object({
  likeeId: z.uuid(),
  verdict: z.enum(["like", "pass"]),
});

/**
 * Enregistre un like/passe. IDEMPOTENT : la contrainte unique(liker, likee)
 * + ignoreDuplicates neutralisent double-tap et courses. Un profil devenu
 * invisible/suspendu entre chargement et action ne fait pas échouer l'action
 * (le like est inoffensif ; le profil disparaît des lots suivants).
 */
export async function submitVerdict(
  likeeId: string,
  verdict: "like" | "pass",
): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireDiscoveryUser();

  const parsed = verdictSchema.safeParse({ likeeId, verdict });
  if (!parsed.success) return { ok: false };
  if (parsed.data.likeeId === user.id) return { ok: false };

  // RLS likes_insert_own garantit liker_id = auth.uid() et l'absence de bloc.
  const { error } = await supabase.from("likes").upsert(
    {
      liker_id: user.id,
      likee_id: parsed.data.likeeId,
      type: parsed.data.verdict,
    },
    { onConflict: "liker_id,likee_id", ignoreDuplicates: true },
  );

  // Un échec RLS (bloc apparu entre-temps…) n'est pas une erreur utilisateur.
  return { ok: !error };
}

/** Recharge un lot en excluant les cartes encore en main côté client. */
export async function fetchMoreProfiles(
  excludeIds: string[],
): Promise<DiscoveryBatch> {
  await requireDiscoveryUser();
  const exclude = z.array(z.uuid()).max(50).safeParse(excludeIds);
  return loadDiscoveryBatch(exclude.success ? exclude.data : []);
}

const filtersSchema = z
  .object({
    maxDistanceKm: z.coerce.number<number>().int().min(1).max(20000),
    ageMin: z.coerce.number<number>().int().min(18).max(99),
    ageMax: z.coerce.number<number>().int().min(18).max(99),
  })
  .refine((data) => data.ageMax >= data.ageMin, {
    message: "La tranche d'âge est inversée.",
    path: ["ageMax"],
  });

export type FiltersState = { error?: string };

/** Filtre rapide (rayon + tranche d'âge) : met à jour les préférences. */
export async function updateDiscoveryFilters(
  _prev: FiltersState,
  formData: FormData,
): Promise<FiltersState> {
  const { supabase, user } = await requireDiscoveryUser();

  const parsed = filtersSchema.safeParse({
    maxDistanceKm: formData.get("maxDistanceKm"),
    ageMin: formData.get("ageMin"),
    ageMax: formData.get("ageMax"),
  });
  if (!parsed.success) {
    return { error: "Vérifie les filtres : la tranche d'âge est peut-être inversée." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      max_distance_km: parsed.data.maxDistanceKm,
      age_min: parsed.data.ageMin,
      age_max: parsed.data.ageMax,
    })
    .eq("user_id", user.id);
  if (error) return { error: "Une erreur est survenue. Réessaie dans un instant." };

  redirect("/discover"); // recharge le deck avec les nouveaux filtres
}
