"use client";

import { useRef, useState, useTransition } from "react";
import { applyDiscoveryFilters } from "@/lib/discover/actions";
import {
  AGE_MIN,
  AGE_MAX,
  DISTANCE_MAX_KM,
  type DiscoveryFilters,
} from "@/lib/discover/filters";
import type { DiscoveryBatch } from "@/lib/discover/queries";
import { GENDERS, GENDER_LABELS } from "@/lib/onboarding/validation";
import { SlidersIcon } from "@/components/brand/icons";

/** Valeurs par défaut de l'app (repli du « Réinitialiser » sans état antérieur). */
const APP_DEFAULTS: DiscoveryFilters = {
  maxDistanceKm: 50,
  ageMin: AGE_MIN,
  ageMax: AGE_MAX,
  interestedIn: [...GENDERS],
};

const rangeClass =
  "w-full accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-full";

export function DiscoveryFilters({
  defaults,
  onApplied,
}: {
  defaults: DiscoveryFilters;
  /** Reçoit le lot frais + les filtres normalisés après application. */
  onApplied: (batch: DiscoveryBatch, filters: DiscoveryFilters) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // État local des sliders — appliqué en UN appel serveur au clic « Appliquer ».
  const [distance, setDistance] = useState(defaults.maxDistanceKm);
  const [ageMin, setAgeMin] = useState(defaults.ageMin);
  const [ageMax, setAgeMax] = useState(defaults.ageMax);
  const [genders, setGenders] = useState<string[]>(defaults.interestedIn);

  // Snapshot capturé à l'ouverture — base du « Réinitialiser ».
  const snapshotRef = useRef<DiscoveryFilters>(defaults);

  function syncFrom(f: DiscoveryFilters) {
    setDistance(f.maxDistanceKm);
    setAgeMin(f.ageMin);
    setAgeMax(f.ageMax);
    setGenders(f.interestedIn);
  }

  function open() {
    const snap = defaults ?? APP_DEFAULTS;
    snapshotRef.current = snap;
    syncFrom(snap);
    setError(null);
    dialogRef.current?.showModal();
  }

  function reset() {
    // Reviens aux valeurs d'avant ouverture (ou défauts app si aucune).
    const base = snapshotRef.current ?? APP_DEFAULTS;
    syncFrom(base.interestedIn.length > 0 ? base : APP_DEFAULTS);
    setError(null);
  }

  function toggleGender(g: string) {
    setGenders((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  }

  function apply() {
    if (pending) return;
    if (genders.length === 0) {
      setError("Choisis au moins un genre à rencontrer.");
      return;
    }
    setError(null);
    // Clamp de sécurité côté UI : jamais de tranche inversée envoyée.
    const lo = Math.min(ageMin, ageMax);
    const hi = Math.max(ageMin, ageMax);
    const payload: DiscoveryFilters = {
      maxDistanceKm: distance,
      ageMin: lo,
      ageMax: hi,
      interestedIn: genders,
    };
    startTransition(async () => {
      const res = await applyDiscoveryFilters(payload);
      if (res.ok) {
        onApplied(res.batch, res.filters);
        dialogRef.current?.close();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex items-center gap-2 self-end rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <SlidersIcon className="h-6 w-6 text-ink/70" />
        Filtres
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="filters-title"
        className="w-[min(28rem,calc(100vw-2rem))] rounded-card bg-white p-0 text-ink shadow-sm backdrop:bg-ink/60"
      >
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <h2 id="filters-title" className="font-display text-h3 text-ink">
              Filtres
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-btn px-2 py-1 text-legend text-ink/60 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Fermer
            </button>
          </div>

          {/* Distance ------------------------------------------------------ */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor="f-distance" className="text-legend text-ink">
                Rayon de recherche
              </label>
              <span className="text-legend font-display font-semibold text-ink">
                {distance} km
              </span>
            </div>
            <input
              id="f-distance"
              type="range"
              min={1}
              max={DISTANCE_MAX_KM}
              step={1}
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
              className={rangeClass}
            />
          </div>

          {/* Tranche d'âge (double slider) --------------------------------- */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-legend text-ink">Tranche d&apos;âge</span>
              <span className="text-legend font-display font-semibold text-ink">
                {Math.min(ageMin, ageMax)} – {Math.max(ageMin, ageMax)} ans
              </span>
            </div>
            <label htmlFor="f-age-min" className="text-legend text-ink/70">
              Âge minimum
            </label>
            <input
              id="f-age-min"
              type="range"
              min={AGE_MIN}
              max={AGE_MAX}
              step={1}
              value={ageMin}
              onChange={(e) => setAgeMin(Math.min(Number(e.target.value), ageMax))}
              className={rangeClass}
            />
            <label htmlFor="f-age-max" className="text-legend text-ink/70">
              Âge maximum
            </label>
            <input
              id="f-age-max"
              type="range"
              min={AGE_MIN}
              max={AGE_MAX}
              step={1}
              value={ageMax}
              onChange={(e) => setAgeMax(Math.max(Number(e.target.value), ageMin))}
              className={rangeClass}
            />
          </div>

          {/* Genre recherché ----------------------------------------------- */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-legend text-ink">
              Je veux rencontrer…
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {GENDERS.map((gender) => (
                <label
                  key={gender}
                  className="flex cursor-pointer items-center gap-2 rounded-btn border border-ink/15 px-4 py-2 text-body text-ink has-[:checked]:border-brand has-[:checked]:bg-brand/5"
                >
                  <input
                    type="checkbox"
                    checked={genders.includes(gender)}
                    onChange={() => toggleGender(gender)}
                    className="accent-brand"
                  />
                  {GENDER_LABELS[gender]}
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="text-legend text-error">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={pending}
              className="flex-1 rounded-btn bg-brand px-4 py-2 font-display text-legend font-semibold text-brand-fg transition hover:bg-brand-hover disabled:bg-disabled disabled:text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {pending ? "Application…" : "Appliquer"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
