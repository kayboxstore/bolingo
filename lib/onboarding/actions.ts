"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { geocodeCity } from "@/lib/onboarding/geocode";
import { reencodeImage, sniffImageType } from "@/lib/onboarding/photos";
import {
  basicsSchema,
  bioSchema,
  isUnderage,
  locationSchema,
  PHOTO_MAX_BYTES,
  PHOTOS_MAX,
  preferencesSchema,
  type WizardState,
} from "@/lib/onboarding/validation";

const BUCKET = "profile-photos";
const GENERIC_ERROR = "Une erreur est survenue. Réessaie dans un instant.";

/**
 * Toutes les actions du wizard passent par ce garde : utilisateur authentifié,
 * email vérifié, compte actif, profil non finalisé, et JAMAIS d'écriture si
 * le blocage mineur est posé.
 */
async function requireWritableUser() {
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
  // Profil déjà validé : le wizard est terminé, plus aucune écriture
  // (l'édition post-création sera une brique dédiée).
  if (profile?.onboarding_completed_at) redirect("/onboarding");

  return { supabase, user };
}

function fieldErrorsOf(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Fait avancer la progression (jamais reculer — on peut re-modifier une étape)
 * et renvoie la progression résultante : si l'utilisateur ré-édite une étape
 * depuis le récap, on le renvoie directement au récap.
 */
async function advanceStep(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  completedStep: number,
): Promise<number> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_step")
    .eq("user_id", userId)
    .maybeSingle();
  const current = profile?.onboarding_step ?? 0;
  if (profile && current < completedStep) {
    await supabase
      .from("profiles")
      .update({ onboarding_step: completedStep })
      .eq("user_id", userId);
    return completedStep;
  }
  return Math.max(current, completedStep);
}

/** Cible de redirection après sauvegarde d'une étape. */
function nextPathAfter(step: number, resultingStep: number, fallback: string) {
  return resultingStep >= 5 && step < 5 ? "/onboarding/review" : fallback;
}

// ================================================================ 1 · PHOTOS

export async function uploadPhoto(
  _prev: WizardState,
  formData: FormData,
): Promise<WizardState> {
  const { supabase, user } = await requireWritableUser();

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Sélectionne une photo." };
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return { error: "Fichier trop lourd : 5 Mo maximum." };
  }

  const { data: existing } = await supabase
    .from("profile_photos")
    .select("position")
    .eq("user_id", user.id)
    .order("position");
  const positions = (existing ?? []).map((p) => p.position as number);
  if (positions.length >= PHOTOS_MAX) {
    return { error: `${PHOTOS_MAX} photos maximum.` };
  }

  // Type vérifié par MAGIC BYTES côté serveur — jamais par l'extension.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImageType(bytes);
  if (!kind) {
    return { error: "Format non pris en charge : JPEG, PNG ou WebP uniquement." };
  }

  // Ré-encodage : strip EXIF/GPS, dimensions bornées, anti-polyglotte.
  const clean = await reencodeImage(bytes, kind);
  if (!clean) {
    return { error: "Cette image est illisible ou corrompue. Essaie une autre photo." };
  }

  // Chemin non énumérable : {uid}/{uuid}.{ext} dans un bucket privé.
  const path = `${user.id}/${randomUUID()}.${kind.ext}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, clean, { contentType: kind.mime });
  if (uploadError) {
    return { error: "L'envoi a échoué. Vérifie ta connexion et réessaie." };
  }

  // Première position libre (0 = photo principale).
  let position = 0;
  while (positions.includes(position)) position += 1;

  const { error: insertError } = await supabase
    .from("profile_photos")
    .insert({ user_id: user.id, storage_path: path, position });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]); // pas d'orphelin
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/onboarding/photos");
  return {};
}

export async function deletePhoto(formData: FormData): Promise<void> {
  const { supabase } = await requireWritableUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Suppression + renumérotation ATOMIQUES côté DB (position 0 = principale
  // garantie). L'objet Storage est purgé ensuite ; en cas d'échec il reste un
  // orphelin inoffensif dans un bucket privé (balayage périodique à prévoir).
  const { data: removedPath, error } = await supabase.rpc(
    "delete_photo_and_compact",
    { photo: id },
  );
  if (error || !removedPath) return;

  await supabase.storage.from(BUCKET).remove([removedPath as string]);

  revalidatePath("/onboarding/photos");
}

export async function movePhoto(formData: FormData): Promise<void> {
  const { supabase, user } = await requireWritableUser();
  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;

  const { data: photos } = await supabase
    .from("profile_photos")
    .select("id, position")
    .eq("user_id", user.id)
    .order("position");
  if (!photos) return;

  const index = photos.findIndex((p) => p.id === id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= photos.length) return;

  await supabase.rpc("swap_photo_positions", {
    photo_a: photos[index].id,
    photo_b: photos[targetIndex].id,
  });

  revalidatePath("/onboarding/photos");
}

export async function continueFromPhotos(): Promise<void> {
  const { supabase, user } = await requireWritableUser();
  const { count } = await supabase
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!count || count < 1) redirect("/onboarding/photos"); // min 1 requise
  const step = await advanceStep(supabase, user.id, 1);
  redirect(nextPathAfter(1, step, "/onboarding/basics"));
}

// ========================================================== 2 · INFOS DE BASE

export async function saveBasics(
  _prev: WizardState,
  formData: FormData,
): Promise<WizardState> {
  const { supabase, user } = await requireWritableUser();

  const parsed = basicsSchema.safeParse({
    displayName: formData.get("displayName"),
    birthdate: formData.get("birthdate"),
    gender: formData.get("gender"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  // ---- CONTRAINTE LÉGALE : 18 ans révolus, vérifiée CÔTÉ SERVEUR. ----------
  // Moins de 18 ans : blocage définitif du compte pour la création de profil,
  // et purge de toute donnée de profil déjà collectée (photos incluses).
  if (isUnderage(parsed.data.birthdate)) {
    const { data: photos } = await supabase
      .from("profile_photos")
      .select("storage_path")
      .eq("user_id", user.id);
    const paths = (photos ?? []).map((p) => p.storage_path as string);
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths);
    }
    // Supprime aussi les lignes profil/photos. L'échec du flag est bloquant :
    // on ne doit jamais montrer l'écran « bloqué » sans que le flag soit posé.
    const { error: rpcError } = await supabase.rpc("record_underage_attempt");
    if (rpcError) return { error: GENERIC_ERROR };
    redirect("/onboarding/blocked");
  }

  // NB : onboarding_step absent du payload — advanceStep gère la progression
  // sans jamais la faire régresser (ré-édition depuis le récap).
  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      display_name: parsed.data.displayName,
      birthdate: parsed.data.birthdate,
      gender: parsed.data.gender,
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: GENERIC_ERROR };

  const step = await advanceStep(supabase, user.id, 2);
  redirect(nextPathAfter(2, step, "/onboarding/bio"));
}

// ==================================================================== 3 · BIO

export async function saveBio(
  _prev: WizardState,
  formData: FormData,
): Promise<WizardState> {
  const { supabase, user } = await requireWritableUser();

  const parsed = bioSchema.safeParse({ bio: formData.get("bio") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const { error } = await supabase
    .from("profiles")
    .update({ bio: parsed.data.bio || null })
    .eq("user_id", user.id);
  if (error) return { error: GENERIC_ERROR };

  const step = await advanceStep(supabase, user.id, 3);
  redirect(nextPathAfter(3, step, "/onboarding/preferences"));
}

// ============================================================ 4 · PRÉFÉRENCES

export async function savePreferences(
  _prev: WizardState,
  formData: FormData,
): Promise<WizardState> {
  const { supabase, user } = await requireWritableUser();

  const parsed = preferencesSchema.safeParse({
    interestedIn: formData.getAll("interestedIn"),
    ageMin: formData.get("ageMin"),
    ageMax: formData.get("ageMax"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const { error } = await supabase
    .from("profiles")
    .update({
      interested_in: parsed.data.interestedIn,
      age_min: parsed.data.ageMin,
      age_max: parsed.data.ageMax,
    })
    .eq("user_id", user.id);
  if (error) return { error: GENERIC_ERROR };

  const step = await advanceStep(supabase, user.id, 4);
  redirect(nextPathAfter(4, step, "/onboarding/location"));
}

// =========================================================== 5 · LOCALISATION

export async function saveLocation(
  _prev: WizardState,
  formData: FormData,
): Promise<WizardState> {
  const { supabase, user } = await requireWritableUser();

  const parsed = locationSchema.safeParse({ city: formData.get("city") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const force = formData.get("force") === "1";

  let location: string | null = null;
  let cityLabel = parsed.data.city;

  // Suggestion choisie dans l'autocomplete : on honore SES coordonnées
  // (re-géocoder « Montreuil » pourrait retomber sur un homonyme). Les valeurs
  // sont re-validées : bornes géographiques + le libellé doit correspondre.
  const selCity = String(formData.get("selectedCity") ?? "");
  const selLat = Number(formData.get("selectedLat"));
  const selLon = Number(formData.get("selectedLon"));
  const hasSelection =
    selCity === parsed.data.city &&
    Number.isFinite(selLat) &&
    Number.isFinite(selLon) &&
    Math.abs(selLat) <= 90 &&
    Math.abs(selLon) <= 180;

  if (hasSelection) {
    location = `SRID=4326;POINT(${selLon} ${selLat})`;
  } else {
    try {
      const results = await geocodeCity(parsed.data.city, 1);
      if (results.length > 0) {
        const match = results[0];
        cityLabel = match.city;
        // WKT accepté par PostGIS pour une colonne geography(Point, 4326)
        location = `SRID=4326;POINT(${match.longitude} ${match.latitude})`;
      } else if (!force) {
        // Ville non reconnue : message clair, l'utilisateur peut corriger
        // ou continuer sans géolocalisation.
        return {
          code: "city_not_found",
          error:
            "Ville non reconnue. Vérifie l'orthographe, ou continue sans géolocalisation.",
        };
      }
    } catch (cause) {
      // Échec technique du géocodage : on ne bloque PAS le parcours ;
      // loggé pour revue (sans données sensibles — la ville seule).
      console.error(
        `[geocode] failed for city ${JSON.stringify(parsed.data.city)}:`,
        cause instanceof Error ? cause.message : cause,
      );
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ city: cityLabel, location })
    .eq("user_id", user.id);
  if (error) return { error: GENERIC_ERROR };

  await advanceStep(supabase, user.id, 5);
  redirect("/onboarding/review");
}

// ============================================================== 6 · VALIDATION

export async function completeOnboarding(
  _prev: WizardState,
  _formData: FormData,
): Promise<WizardState> {
  const { supabase, user } = await requireWritableUser();

  // Photo principale (position 0) dénormalisée pour le futur feed.
  const { data: primary } = await supabase
    .from("profile_photos")
    .select("storage_path")
    .eq("user_id", user.id)
    .eq("position", 0)
    .maybeSingle();
  if (!primary) return { error: "Ajoute au moins une photo avant de valider." };

  // Le trigger DB re-vérifie tout (champs, âge, photo, blocage mineur).
  const { error } = await supabase
    .from("profiles")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      primary_photo_path: primary.storage_path,
      onboarding_step: 5,
    })
    .eq("user_id", user.id);
  if (error) {
    return { error: "Profil incomplet : reprends les étapes manquantes." };
  }

  redirect("/onboarding");
}
