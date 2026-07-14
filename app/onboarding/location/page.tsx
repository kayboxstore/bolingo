import type { Metadata } from "next";
import { requireStep } from "@/lib/onboarding/steps";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { LocationForm } from "@/components/onboarding/location-form";

export const metadata: Metadata = { title: "Ta ville" };

export default async function LocationPage() {
  const snapshot = await requireStep(4);

  return (
    <WizardShell
      step={4}
      title="Où es-tu ?"
      subtitle="Ta ville sert à te proposer des rencontres à proximité. Jamais ton adresse exacte."
    >
      <LocationForm defaultCity={snapshot.profile?.city ?? ""} />
    </WizardShell>
  );
}
