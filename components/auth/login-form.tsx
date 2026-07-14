"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { signIn } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/validation";
import { Field } from "@/components/auth/field";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function LoginForm() {
  const [state, formAction] = useFormState(signIn, initialFormState);

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
      <div className="flex flex-col gap-2">
        <Field
          label="Mot de passe"
          name="password"
          type="password"
          autoComplete="current-password"
          errors={state.fieldErrors?.password}
        />
        <Link
          href="/forgot-password"
          className="self-end text-legend font-medium text-brand hover:text-brand-hover"
        >
          Mot de passe oublié ?
        </Link>
      </div>
      <SubmitButton>Se connecter</SubmitButton>
      <p className="text-center text-legend text-ink/60">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="font-medium text-brand hover:text-brand-hover">
          S&apos;inscrire
        </Link>
      </p>
    </form>
  );
}
