import type { Metadata } from "next";
import { requireStep } from "@/lib/onboarding/steps";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { BasicsForm } from "@/components/onboarding/basics-form";

export const metadata: Metadata = { title: "Tes infos" };

export default async function BasicsPage() {
  const snapshot = await requireStep(1);

  return (
    <WizardShell
      step={1}
      title="Fais les présentations"
      subtitle="Motema est réservé aux personnes majeures (18 ans révolus)."
    >
      <BasicsForm
        defaults={{
          displayName: snapshot.profile?.display_name ?? "",
          birthdate: snapshot.profile?.birthdate ?? "",
          gender: snapshot.profile?.gender ?? "",
        }}
      />
    </WizardShell>
  );
}
