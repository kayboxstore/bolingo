"use client";

import { useFormState } from "react-dom";
import { saveBasics } from "@/lib/onboarding/actions";
import {
  GENDER_LABELS,
  GENDERS,
  initialWizardState,
} from "@/lib/onboarding/validation";
import { Field } from "@/components/auth/field";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function BasicsForm({
  defaults,
}: {
  defaults: { displayName: string; birthdate: string; gender: string };
}) {
  const [state, formAction] = useFormState(saveBasics, initialWizardState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        label="Prénom affiché"
        name="displayName"
        autoComplete="given-name"
        defaultValue={defaults.displayName}
        errors={state.fieldErrors?.displayName}
      />
      <div className="flex flex-col gap-2">
        <label htmlFor="birthdate" className="text-legend text-ink">
          Date de naissance
        </label>
        <input
          id="birthdate"
          name="birthdate"
          type="date"
          required
          defaultValue={defaults.birthdate}
          aria-invalid={state.fieldErrors?.birthdate ? true : undefined}
          aria-describedby="birthdate-hint"
          className="w-full rounded-btn border border-ink/15 bg-white px-4 py-4 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 aria-[invalid]:border-error"
        />
        <p id="birthdate-hint" className="text-legend text-ink/70">
          18 ans révolus obligatoires. Non modifiable ensuite.
        </p>
        {state.fieldErrors?.birthdate && (
          <p className="text-legend text-error" role="alert">
            {state.fieldErrors.birthdate.join(" ")}
          </p>
        )}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-legend text-ink">Tu es…</legend>
        <div className="grid grid-cols-2 gap-2">
          {GENDERS.map((gender) => (
            <label
              key={gender}
              className="flex cursor-pointer items-center gap-2 rounded-btn border border-ink/15 px-4 py-2 text-body text-ink has-[:checked]:border-brand has-[:checked]:bg-brand/5"
            >
              <input
                type="radio"
                name="gender"
                value={gender}
                defaultChecked={defaults.gender === gender}
                required
                className="accent-brand"
              />
              {GENDER_LABELS[gender]}
            </label>
          ))}
        </div>
        {state.fieldErrors?.gender && (
          <p className="text-legend text-error" role="alert">
            {state.fieldErrors.gender.join(" ")}
          </p>
        )}
      </fieldset>
      <SubmitButton>Continuer</SubmitButton>
    </form>
  );
}
