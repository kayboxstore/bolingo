"use client";

/* eslint-disable @next/next/no-img-element -- URLs signées éphémères, hors next/image */

import { useFormState } from "react-dom";
import {
  continueFromPhotos,
  deletePhoto,
  movePhoto,
  uploadPhoto,
} from "@/lib/onboarding/actions";
import { initialWizardState, PHOTOS_MAX } from "@/lib/onboarding/validation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  TrashIcon,
} from "@/components/brand/icons";
import { FormError } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

type PhotoItem = { id: string; position: number; url: string | null };

const actionButtonClass =
  "rounded-btn px-2 py-2 text-ink/60 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 disabled:text-ink/40";

export function PhotosManager({ photos }: { photos: PhotoItem[] }) {
  const [state, uploadAction] = useFormState(uploadPhoto, initialWizardState);
  const canAddMore = photos.length < PHOTOS_MAX;
  const canContinue = photos.length >= 1;

  return (
    <div className="flex flex-col gap-6">
      <FormError message={state.error} />

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="relative flex flex-col gap-2 rounded-btn border border-ink/10 p-2"
            >
              {photo.url ? (
                <img
                  src={photo.url}
                  alt={`Photo ${index + 1}${index === 0 ? " (principale)" : ""}`}
                  className="aspect-square w-full rounded-btn object-cover"
                />
              ) : (
                <div className="aspect-square w-full rounded-btn bg-disabled" />
              )}
              {index === 0 && (
                // Badge texte : rose CTA (le rose vif échouerait AA) — décision v1.1.
                <span className="absolute left-2 top-2 rounded-btn bg-brand px-2 py-1 text-legend text-brand-fg">
                  Principale
                </span>
              )}
              <div className="flex justify-between gap-2">
                <form action={movePhoto}>
                  <input type="hidden" name="id" value={photo.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button
                    type="submit"
                    disabled={index === 0}
                    aria-label={`Avancer la photo ${index + 1}`}
                    className={actionButtonClass}
                  >
                    <ArrowLeftIcon className="h-6 w-6" />
                  </button>
                </form>
                <form action={deletePhoto}>
                  <input type="hidden" name="id" value={photo.id} />
                  <button
                    type="submit"
                    aria-label={`Supprimer la photo ${index + 1}`}
                    className="rounded-btn px-2 py-2 text-error transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                  >
                    <TrashIcon className="h-6 w-6" />
                  </button>
                </form>
                <form action={movePhoto}>
                  <input type="hidden" name="id" value={photo.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={index === photos.length - 1}
                    aria-label={`Reculer la photo ${index + 1}`}
                    className={actionButtonClass}
                  >
                    <ArrowRightIcon className="h-6 w-6" />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAddMore && (
        <form action={uploadAction} className="flex flex-col gap-2">
          <label htmlFor="photo" className="text-legend text-ink">
            Ajouter une photo ({photos.length}/{PHOTOS_MAX})
          </label>
          <input
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            className="w-full rounded-btn border border-ink/15 px-4 py-4 text-legend text-ink/70 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 file:mr-4 file:rounded-btn file:border-0 file:bg-brand file:px-4 file:py-2 file:font-display file:font-semibold file:text-brand-fg"
          />
          <p className="text-legend text-ink/70">
            JPEG, PNG ou WebP · 5 Mo maximum.
          </p>
          <SubmitButton>Envoyer la photo</SubmitButton>
        </form>
      )}

      <form action={continueFromPhotos} className="flex flex-col gap-2">
        <SubmitButton disabled={!canContinue}>Continuer</SubmitButton>
        {!canContinue && (
          <p className="text-center text-legend text-ink/70">
            Ajoute au moins une photo pour continuer.
          </p>
        )}
      </form>
    </div>
  );
}
