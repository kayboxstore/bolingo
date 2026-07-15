import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOnboardingSnapshot, STEP_PATHS } from "@/lib/onboarding/steps";

export const metadata: Metadata = { title: "Ton profil" };

/**
 * Point d'entrée du wizard : reprend à la première étape incomplète.
 * Profil validé → place à la découverte.
 */
export default async function OnboardingPage() {
  const snapshot = await getOnboardingSnapshot();

  if (snapshot.blocked) redirect("/onboarding/blocked");
  if (!snapshot.completed) {
    redirect(`/onboarding/${STEP_PATHS[snapshot.nextStepIndex]}`);
  }

  redirect("/discover");
}
