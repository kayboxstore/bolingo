"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { saveBio } from "@/lib/onboarding/actions";
import { BIO_MAX, initialWizardState } from "@/lib/onboarding/validation";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function BioForm({ defaultBio }: { defaultBio: string }) {
  const [state, formAction] = useFormState(saveBio, initialWizardState);
  const [length, setLength] = useState(defaultBio.length);
  const overLimit = length > BIO_MAX;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <div className="flex flex-col gap-2">
        <label htmlFor="bio" className="text-legend text-ink">
          Bio <span className="text-ink/70">(facultative)</span>
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={6}
          defaultValue={defaultBio}
          onChange={(event) => setLength(event.target.value.length)}
          aria-invalid={overLimit || state.fieldErrors?.bio ? true : undefined}
          aria-describedby="bio-count"
          className="w-full resize-none rounded-btn border border-ink/15 bg-white px-4 py-4 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 aria-[invalid]:border-error"
        />
        <p
          id="bio-count"
          className={`text-right text-legend ${overLimit ? "text-error" : "text-ink/70"}`}
          aria-live="polite"
        >
          {length}/{BIO_MAX}
        </p>
        {state.fieldErrors?.bio && (
          <p className="text-legend text-error" role="alert">
            {state.fieldErrors.bio.join(" ")}
          </p>
        )}
      </div>
      <SubmitButton>Continuer</SubmitButton>
    </form>
  );
}
