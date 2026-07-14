"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { saveLocation } from "@/lib/onboarding/actions";
import { initialWizardState } from "@/lib/onboarding/validation";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

type Suggestion = {
  label: string;
  city: string;
  latitude: number;
  longitude: number;
};

/** Combobox ville — pattern APG : flèches, Entrée, Échap, aria-activedescendant. */
export function LocationForm({ defaultCity }: { defaultCity: string }) {
  const [state, formAction] = useFormState(saveLocation, initialWizardState);
  const [query, setQuery] = useState(defaultCity);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const rootRef = useRef<HTMLDivElement>(null);
  const skipNextFetch = useRef(false);

  // Discriminant machine — jamais de dépendance au texte du message.
  const unrecognized = state.code === "city_not_found";

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (query.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { results: Suggestion[] };
        setSuggestions(data.results);
        setActiveIndex(-1);
        setOpen(data.results.length > 0);
      } catch {
        // autocomplete silencieux — la validation se fait à la sauvegarde
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function select(suggestion: Suggestion) {
    skipNextFetch.current = true;
    setQuery(suggestion.city);
    setSelected(suggestion); // ses coordonnées seront honorées à la sauvegarde
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      select(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  // Ne ferme la liste que si le focus sort réellement du composant.
  function onFocusOut(event: React.FocusEvent<HTMLDivElement>) {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <div
        ref={rootRef}
        onBlur={onFocusOut}
        className="relative flex flex-col gap-2"
      >
        <label htmlFor="city" className="text-legend text-ink">
          Ville
        </label>
        <input
          id="city"
          name="city"
          type="text"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null); // texte modifié → la sélection ne vaut plus
          }}
          onFocus={() => setOpen(suggestions.length > 0)}
          onKeyDown={onKeyDown}
          required
          role="combobox"
          aria-expanded={open}
          aria-controls="city-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `city-option-${activeIndex}` : undefined
          }
          aria-invalid={state.fieldErrors?.city ? true : undefined}
          className="w-full rounded-btn border border-ink/15 bg-white px-4 py-4 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 aria-[invalid]:border-error"
        />
        {open && (
          <ul
            id="city-suggestions"
            role="listbox"
            aria-label="Suggestions de villes"
            className="absolute top-full z-10 mt-2 w-full rounded-btn border border-ink/10 bg-white py-2 shadow-sm"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.label}
                id={`city-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => select(suggestion)}
                  className={`w-full px-4 py-2 text-left text-body text-ink hover:bg-ink/[0.03] ${
                    index === activeIndex ? "bg-ink/[0.03]" : ""
                  }`}
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
      {selected && (
        <>
          <input type="hidden" name="selectedCity" value={selected.city} />
          <input type="hidden" name="selectedLat" value={selected.latitude} />
          <input type="hidden" name="selectedLon" value={selected.longitude} />
        </>
      )}
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
