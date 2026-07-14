import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Ordre du wizard. `onboarding_step` = nombre d'étapes complétées (0-5). */
export const STEP_PATHS = [
  "photos",
  "basics",
  "bio",
  "preferences",
  "location",
  "review",
] as const;

export const STEP_TITLES = [
  "Photos",
  "Infos",
  "Bio",
  "Préférences",
  "Localisation",
  "Récap",
] as const;

export type ProfileRow = {
  user_id: string;
  display_name: string | null;
  birthdate: string | null;
  gender: string | null;
  bio: string | null;
  city: string | null;
  interested_in: string[];
  age_min: number;
  age_max: number;
  onboarding_step: number;
  onboarding_completed_at: string | null;
};

export type PhotoRow = {
  id: string;
  storage_path: string;
  position: number;
};

export type OnboardingSnapshot = {
  userId: string;
  email: string | null;
  blocked: boolean;
  completed: boolean;
  photos: PhotoRow[];
  profile: ProfileRow | null;
  /** Index 0-based de la prochaine étape incomplète. */
  nextStepIndex: number;
};

export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login"); // le middleware garde déjà — ceinture

  const [accountRes, profileRes, photosRes] = await Promise.all([
    supabase
      .from("users")
      .select("underage_attempted_at")
      .eq("id", user.id)
      .single(),
    // Liste explicite : la colonne `location` n'est plus lisible côté client
    // (révocation column-level, cf. migration 0003) et le wizard n'en a pas besoin.
    supabase
      .from("profiles")
      .select(
        "user_id, display_name, birthdate, gender, bio, city, interested_in, age_min, age_max, onboarding_step, onboarding_completed_at",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profile_photos")
      .select("id, storage_path, position")
      .eq("user_id", user.id)
      .order("position"),
  ]);

  const blocked = Boolean(accountRes.data?.underage_attempted_at);
  const profile = (profileRes.data as ProfileRow | null) ?? null;
  const photos = (photosRes.data as PhotoRow[] | null) ?? [];
  const completed = Boolean(profile?.onboarding_completed_at);

  let nextStepIndex: number;
  if (photos.length === 0) nextStepIndex = 0;
  else if (!profile) nextStepIndex = 1;
  else nextStepIndex = Math.min(Math.max(profile.onboarding_step, 1), 5);

  return {
    userId: user.id,
    email: user.email ?? null,
    blocked,
    completed,
    photos,
    profile,
    nextStepIndex,
  };
}

/**
 * Garde d'étape : bloqué → écran légal ; terminé → /onboarding ; étape
 * au-delà de la progression → renvoi vers la bonne étape. Les étapes déjà
 * complétées restent accessibles (modification avant validation finale).
 */
export async function requireStep(
  stepIndex: number,
): Promise<OnboardingSnapshot> {
  const snapshot = await getOnboardingSnapshot();
  if (snapshot.blocked) redirect("/onboarding/blocked");
  if (snapshot.completed) redirect("/onboarding");
  if (stepIndex > snapshot.nextStepIndex) {
    redirect(`/onboarding/${STEP_PATHS[snapshot.nextStepIndex]}`);
  }
  return snapshot;
}
