"use client";

import { useFormState } from "react-dom";
import { resendVerification } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/validation";
import { Field } from "@/components/auth/field";
import { FormError, FormSuccess } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

/** Renvoi de l'email de vérification. L'email est pré-rempli si connu. */
export function ResendForm({ email }: { email?: string }) {
  const [state, formAction] = useFormState(
    resendVerification,
    initialFormState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      {!state.success && (
        <>
          {email ? (
            <input type="hidden" name="email" value={email} />
          ) : (
            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              errors={state.fieldErrors?.email}
            />
          )}
          <SubmitButton>Renvoyer l&apos;email</SubmitButton>
        </>
      )}
    </form>
  );
}
