"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { forgotPassword } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/validation";
import { Field } from "@/components/auth/field";
import { FormError, FormSuccess } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function ForgotPasswordForm() {
  const [state, formAction] = useFormState(forgotPassword, initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      {!state.success && (
        <>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            errors={state.fieldErrors?.email}
          />
          <SubmitButton>Envoyer le lien</SubmitButton>
        </>
      )}
      <p className="text-center text-legend text-ink/60">
        <Link href="/login" className="font-medium text-brand hover:text-brand-hover">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
