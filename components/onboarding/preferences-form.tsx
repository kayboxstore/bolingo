"use client";

import { useFormState } from "react-dom";
import { savePreferences } from "@/lib/onboarding/actions";
import {
  GENDER_LABELS,
  GENDERS,
  initialWizardState,
} from "@/lib/onboarding/validation";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

const AGES = Array.from({ length: 82 }, (_, i) => i + 18); // 18..99

export function PreferencesForm({
  defaults,
}: {
  defaults: { interestedIn: string[]; ageMin: number; ageMax: number };
}) {
  const [state, formAction] = useFormState(savePreferences, initialWizardState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-legend text-ink">Je veux rencontrer…</legend>
        <div className="grid grid-cols-2 gap-2">
          {GENDERS.map((gender) => (
            <label
              key={gender}
              className="flex cursor-pointer items-center gap-2 rounded-btn border border-ink/15 px-4 py-2 text-body text-ink has-[:checked]:border-brand has-[:checked]:bg-brand/5"
            >
              <input
                type="checkbox"
                name="interestedIn"
                value={gender}
                defaultChecked={defaults.interestedIn.includes(gender)}
                className="accent-brand"
              />
              {GENDER_LABELS[gender]}
            </label>
          ))}
        </div>
        {state.fieldErrors?.interestedIn && (
          <p className="text-legend text-error" role="alert">
            {state.fieldErrors.interestedIn.join(" ")}
          </p>
        )}
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="ageMin" className="text-legend text-ink">
            Âge minimum
          </label>
          <select
            id="ageMin"
            name="ageMin"
            defaultValue={defaults.ageMin}
            className="w-full rounded-btn border border-ink/15 bg-white px-4 py-4 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
          >
            {AGES.map((age) => (
              <option key={age} value={age}>
                {age} ans
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ageMax" className="text-legend text-ink">
            Âge maximum
          </label>
          <select
            id="ageMax"
            name="ageMax"
            defaultValue={defaults.ageMax}
            className="w-full rounded-btn border border-ink/15 bg-white px-4 py-4 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
          >
            {AGES.map((age) => (
              <option key={age} value={age}>
                {age} ans
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.fieldErrors?.ageMax && (
        <p className="text-legend text-error" role="alert">
          {state.fieldErrors.ageMax.join(" ")}
        </p>
      )}
      <SubmitButton>Continuer</SubmitButton>
    </form>
  );
}
