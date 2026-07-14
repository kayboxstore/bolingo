"use client";

import { useFormState } from "react-dom";
import {
  updateDiscoveryFilters,
  type FiltersState,
} from "@/lib/discover/actions";
import { ChevronDownIcon } from "@/components/brand/icons";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

const RADII = [5, 10, 25, 50, 100, 250] as const;
const AGES = Array.from({ length: 82 }, (_, i) => i + 18); // 18..99

const selectClass =
  "w-full rounded-btn border border-ink/15 bg-white px-4 py-4 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25";

/** Filtre rapide : rayon + tranche d'âge (persistés dans les préférences). */
export function DiscoveryFilters({
  defaults,
}: {
  defaults: { maxDistanceKm: number; ageMin: number; ageMax: number };
}) {
  const [state, formAction] = useFormState<FiltersState, FormData>(
    updateDiscoveryFilters,
    {},
  );

  return (
    <details className="group rounded-card border border-ink/10 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 font-display text-body font-semibold text-ink">
        Filtres
        <ChevronDownIcon className="h-6 w-6 text-ink/60 transition group-open:rotate-180" />
      </summary>
      <form action={formAction} className="flex flex-col gap-4 border-t border-ink/10 p-6">
        <FormError message={state.error} />
        <div className="flex flex-col gap-2">
          <label htmlFor="maxDistanceKm" className="text-legend text-ink">
            Rayon de recherche
          </label>
          <select
            id="maxDistanceKm"
            name="maxDistanceKm"
            defaultValue={nearestRadius(defaults.maxDistanceKm)}
            className={selectClass}
          >
            {RADII.map((km) => (
              <option key={km} value={km}>
                {km} km
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="ageMin" className="text-legend text-ink">
              Âge minimum
            </label>
            <select
              id="ageMin"
              name="ageMin"
              defaultValue={defaults.ageMin}
              className={selectClass}
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
              className={selectClass}
            >
              {AGES.map((age) => (
                <option key={age} value={age}>
                  {age} ans
                </option>
              ))}
            </select>
          </div>
        </div>
        <SubmitButton>Appliquer</SubmitButton>
      </form>
    </details>
  );
}

function nearestRadius(value: number): number {
  return RADII.reduce((best, km) =>
    Math.abs(km - value) < Math.abs(best - value) ? km : best,
  );
}
