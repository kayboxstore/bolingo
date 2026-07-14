"use client";

import { useFormState } from "react-dom";
import { completeOnboarding } from "@/lib/onboarding/actions";
import { initialWizardState } from "@/lib/onboarding/validation";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function CompleteButton() {
  const [state, formAction] = useFormState(
    completeOnboarding,
    initialWizardState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormError message={state.error} />
      <SubmitButton>Valider mon profil</SubmitButton>
    </form>
  );
}
