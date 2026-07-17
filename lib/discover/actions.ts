"use server";

import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/guards";
import { GENDERS } from "@/lib/onboarding/validation";
import { loadDiscoveryBatch, type DiscoveryBatch } from "@/lib/discover/queries";
import {
  AGE_MIN,
  AGE_MAX,
  DISTANCE_MAX_KM,
  type DiscoveryFilters,
} from "@/lib/discover/filters";

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

export type ApplyFiltersResult =
  | { ok: true; batch: DiscoveryBatch; filters: DiscoveryFilters }
  | { ok: false; error: string };

// Validation serveur systématique : âge >= 18 (plancher légal indépassable),
// distance bornée à l'index géo, genre ∈ GENDERS (jamais de valeur inventée),
// tranche non inversée. L'UI empêche déjà tout ça — c'est la défense serveur.
const filtersSchema = z
  .object({
    maxDistanceKm: z.coerce.number<number>().int().min(1).max(DISTANCE_MAX_KM),
    ageMin: z.coerce.number<number>().int().min(AGE_MIN).max(AGE_MAX),
    ageMax: z.coerce.number<number>().int().min(AGE_MIN).max(AGE_MAX),
    interestedIn: z.array(z.enum(GENDERS)).min(1).max(GENDERS.length),
  })
  .refine((data) => data.ageMax >= data.ageMin, {
    message: "La tranche d'âge est inversée.",
    path: ["ageMax"],
  });

/**
 * Filtre rapide (rayon + tranche d'âge + genre recherché) : met à jour les
 * MÊMES colonnes que l'onboarding (un seul jeu de préférences, persistant) puis
 * renvoie un lot frais — le deck se recharge en place, sans reload de page.
 * Renvoie aussi les filtres normalisés pour que le client resynchronise son
 * snapshot (base du « Réinitialiser »).
 */
export async function applyDiscoveryFilters(
  input: DiscoveryFilters,
): Promise<ApplyFiltersResult> {
  const { supabase, user } = await requireActiveMember();

  const parsed = filtersSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Vérifie tes critères : tranche d'âge, distance ou genre invalide.",
    };
  }
  const interestedIn = Array.from(new Set(parsed.data.interestedIn));

  const { error } = await supabase
    .from("profiles")
    .update({
      max_distance_km: parsed.data.maxDistanceKm,
      age_min: parsed.data.ageMin,
      age_max: parsed.data.ageMax,
      interested_in: interestedIn,
    })
    .eq("user_id", user.id);
  if (error) {
    return { ok: false, error: "Une erreur est survenue. Réessaie dans un instant." };
  }

  const batch = await loadDiscoveryBatch();
  return {
    ok: true,
    batch,
    filters: {
      maxDistanceKm: parsed.data.maxDistanceKm,
      ageMin: parsed.data.ageMin,
      ageMax: parsed.data.ageMax,
      interestedIn,
    },
  };
}
