import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HeartIcon } from "@/components/brand/logo";
import { getOnboardingSnapshot, STEP_PATHS } from "@/lib/onboarding/steps";

export const metadata: Metadata = { title: "Ton profil" };

/**
 * Point d'entrée du wizard : reprend à la première étape incomplète.
 * Une fois le profil validé, affiche l'écran « profil complet ».
 */
export default async function OnboardingPage() {
  const snapshot = await getOnboardingSnapshot();

  if (snapshot.blocked) redirect("/onboarding/blocked");
  if (!snapshot.completed) {
    redirect(`/onboarding/${STEP_PATHS[snapshot.nextStepIndex]}`);
  }

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <HeartIcon className="h-12 w-12" />
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="font-display text-h1 text-ink">Profil complet !</h1>
        <p className="text-body text-ink/70">
          Bienvenue sur Motema, {snapshot.profile?.display_name}. La découverte
          des profils autour de toi arrive très bientôt.
        </p>
      </div>
      <span className="rounded-btn bg-disabled px-4 py-2 font-display text-body font-semibold text-ink/60">
        Découverte — à venir
      </span>
    </section>
  );
}
