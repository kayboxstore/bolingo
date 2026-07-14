"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { saveLocation } from "@/lib/onboarding/actions";
import { initialWizardState } from "@/lib/onboarding/validation";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

type Suggestion = { label: string; city: string };

export function LocationForm({ defaultCity }: { defaultCity: string }) {
  const [state, formAction] = useFormState(saveLocation, initialWizardState);
  const [query, setQuery] = useState(defaultCity);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // La ville n'a pas été reconnue : proposer de continuer sans géolocalisation.
  const unrecognized = Boolean(state.error?.startsWith("Ville non reconnue"));

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { results: Suggestion[] };
        setSuggestions(data.results);
        setOpen(data.results.length > 0);
      } catch {
        // autocomplete silencieux — la validation se fait à la sauvegarde
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <div className="relative flex flex-col gap-2">
        <label htmlFor="city" className="text-legend text-ink">
          Ville
        </label>
        <input
          id="city"
          name="city"
          type="text"
          autoComplete="address-level2"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(suggestions.length > 0)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          required
          role="combobox"
          aria-expanded={open}
          aria-controls="city-suggestions"
          aria-invalid={state.fieldErrors?.city ? true : undefined}
          className="w-full rounded-btn border border-ink/15 bg-white px-4 py-4 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 aria-[invalid]:border-error"
        />
        {open && (
          <ul
            id="city-suggestions"
            role="listbox"
            className="absolute top-full z-10 mt-2 w-full rounded-btn border border-ink/10 bg-white py-2 shadow-sm"
          >
            {suggestions.map((suggestion) => (
              <li key={suggestion.label} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setQuery(suggestion.city);
                    setOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-body text-ink hover:bg-ink/[0.03]"
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {state.fieldErrors?.city && (
          <p className="text-legend text-error" role="alert">
            {state.fieldErrors.city.join(" ")}
          </p>
        )}
      </div>
      {unrecognized && (
        <label className="flex cursor-pointer items-center gap-2 text-legend text-ink">
          <input type="checkbox" name="force" value="1" className="accent-brand" />
          Continuer sans géolocalisation (ma ville est correcte)
        </label>
      )}
      <SubmitButton>Continuer</SubmitButton>
    </form>
  );
}
