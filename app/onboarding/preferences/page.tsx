import type { Metadata } from "next";
import { requireStep } from "@/lib/onboarding/steps";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { PreferencesForm } from "@/components/onboarding/preferences-form";

export const metadata: Metadata = { title: "Tes préférences" };

export default async function PreferencesPage() {
  const snapshot = await requireStep(3);

  return (
    <WizardShell
      step={3}
      title="Qui veux-tu rencontrer ?"
      subtitle="Tu pourras affiner ces critères plus tard."
    >
      <PreferencesForm
        defaults={{
          interestedIn: snapshot.profile?.interested_in ?? [],
          ageMin: snapshot.profile?.age_min ?? 18,
          ageMax: snapshot.profile?.age_max ?? 99,
        }}
      />
    </WizardShell>
  );
}
