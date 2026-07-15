"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/guards";
import { loadDiscoveryBatch, type DiscoveryBatch } from "@/lib/discover/queries";

const verdictSchema = z.object({
  likeeId: z.uuid(),
  verdict: z.enum(["like", "pass"]),
});

/**
 * Enregistre un like/passe. IDEMPOTENT : la contrainte unique(liker, likee)
 * + ignoreDuplicates neutralisent double-tap et courses. Un profil devenu
 * invisible/suspendu entre chargement et action ne fait pas échouer l'action
 * (le like est inoffensif ; le profil disparaît des lots suivants).
 *
 * Renvoie `matched: true` quand le match existe — notification in-app à
 * chaud. La lecture est effectuée pour CHAQUE like, réciproque ou non :
 * coût constant, pas d'oracle temporel sur « qui m'a liké ».
 */
export async function submitVerdict(
  likeeId: string,
  verdict: "like" | "pass",
): Promise<{ ok: boolean; matched: boolean }> {
  const { supabase, user } = await requireActiveMember();

  const parsed = verdictSchema.safeParse({ likeeId, verdict });
  if (!parsed.success) return { ok: false, matched: false };
  if (parsed.data.likeeId === user.id) return { ok: false, matched: false };

  // RLS likes_insert_own garantit liker_id = auth.uid() et l'absence de bloc.
  const { error } = await supabase.from("likes").upsert(
    {
      liker_id: user.id,
      likee_id: parsed.data.likeeId,
      type: parsed.data.verdict,
    },
    { onConflict: "liker_id,likee_id", ignoreDuplicates: true },
  );

  let matched = false;
  if (parsed.data.verdict === "like" && !error) {
    // Paire canonique. UUID en minuscules AVANT le tri : zod accepte l'hexa
    // majuscule, or 'F' < 'a' en ASCII inverserait la paire (aucune fuite,
    // juste un match manqué à l'affichage).
    const [a, b] = [user.id, parsed.data.likeeId.toLowerCase()].sort();
    const { data: match } = await supabase
      .from("matches")
      .select("id")
      .eq("user_a", a)
      .eq("user_b", b)
      .eq("status", "active")
      .maybeSingle();
    matched = Boolean(match);
  }

  // Un échec RLS (bloc apparu entre-temps…) n'est pas une erreur utilisateur.
  return { ok: !error, matched };
}

/** Recharge un lot en excluant les cartes encore en main côté client. */
export async function fetchMoreProfiles(
  excludeIds: string[],
): Promise<DiscoveryBatch> {
  await requireActiveMember();
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
  const { supabase, user } = await requireActiveMember();

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
