"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { geocodeCity } from "@/lib/onboarding/geocode";
import { sniffImageType } from "@/lib/onboarding/photos";
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
 * email vérifié, et JAMAIS d'écriture si le blocage mineur est posé.
 */
async function requireWritableUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/verify-email");

  const { data: account } = await supabase
    .from("users")
    .select("underage_attempted_at")
    .eq("id", user.id)
    .single();
  if (account?.underage_attempted_at) redirect("/onboarding/blocked");

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

/** Fait avancer la progression (jamais reculer — on peut re-modifier une étape). */
async function advanceStep(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  completedStep: number,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_step")
    .eq("user_id", userId)
    .maybeSingle();
  if (profile && profile.onboarding_step < completedStep) {
    await supabase
      .from("profiles")
      .update({ onboarding_step: completedStep })
      .eq("user_id", userId);
  }
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

  // Chemin non énumérable : {uid}/{uuid}.{ext} dans un bucket privé.
  const path = `${user.id}/${randomUUID()}.${kind.ext}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: kind.mime });
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
  const { supabase, user } = await requireWritableUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { data: photo } = await supabase
    .from("profile_photos")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!photo) return;

  await supabase.from("profile_photos").delete().eq("id", id);
  await supabase.storage.from(BUCKET).remove([photo.storage_path]);

  // Compacte les positions pour que 0 reste la photo principale.
  const { data: rest } = await supabase
    .from("profile_photos")
    .select("id, position")
    .eq("user_id", user.id)
    .order("position");
  for (const [index, row] of (rest ?? []).entries()) {
    if (row.position !== index) {
      await supabase
        .from("profile_photos")
        .update({ position: index })
        .eq("id", row.id);
    }
  }

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
  await advanceStep(supabase, user.id, 1);
  redirect("/onboarding/basics");
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
    await supabase.rpc("record_underage_attempt"); // supprime aussi les lignes
    redirect("/onboarding/blocked");
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      display_name: parsed.data.displayName,
      birthdate: parsed.data.birthdate,
      gender: parsed.data.gender,
      onboarding_step: 2,
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: GENERIC_ERROR };

  await advanceStep(supabase, user.id, 2);
  redirect("/onboarding/bio");
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

  await advanceStep(supabase, user.id, 3);
  redirect("/onboarding/preferences");
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

  await advanceStep(supabase, user.id, 4);
  redirect("/onboarding/location");
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
