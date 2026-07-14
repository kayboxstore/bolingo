"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { signUp } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/validation";
import { Field } from "@/components/auth/field";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function SignupForm() {
  const [state, formAction] = useFormState(signUp, initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        errors={state.fieldErrors?.email}
      />
      <Field
        label="Mot de passe"
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
      <SubmitButton>S&apos;inscrire</SubmitButton>
      <p className="text-center text-legend text-ink/60">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-brand hover:text-brand-hover">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
