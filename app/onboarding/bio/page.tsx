import type { Metadata } from "next";
import { requireStep } from "@/lib/onboarding/steps";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { BioForm } from "@/components/onboarding/bio-form";

export const metadata: Metadata = { title: "Ta bio" };

export default async function BioPage() {
  const snapshot = await requireStep(2);

  return (
    <WizardShell
      step={2}
      title="Raconte ton histoire"
      subtitle="Chaque profil raconte une histoire — la tienne, en quelques lignes."
    >
      <BioForm defaultBio={snapshot.profile?.bio ?? ""} />
    </WizardShell>
  );
}
