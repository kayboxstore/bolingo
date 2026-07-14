"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { resetPassword } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/validation";
import { Field } from "@/components/auth/field";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function ResetPasswordForm() {
  const [state, formAction] = useFormState(resetPassword, initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        label="Nouveau mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="8 caractères minimum, dont au moins 1 chiffre."
        errors={state.fieldErrors?.password}
      />
      <Field
        label="Confirme le mot de passe"
        name="confirm"
        type="password"
        autoComplete="new-password"
        errors={state.fieldErrors?.confirm}
      />
      <SubmitButton>Réinitialiser</SubmitButton>
      {state.error && (
        <p className="text-center text-legend text-ink/60">
          <Link
            href="/forgot-password"
            className="font-medium text-brand hover:text-brand-hover"
          >
            Demander un nouveau lien
          </Link>
        </p>
      )}
    </form>
  );
}
