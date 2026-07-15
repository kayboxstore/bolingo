/* eslint-disable @next/next/no-img-element -- URLs signées éphémères, hors next/image */

import type { DiscoveryCard } from "@/lib/discover/queries";
import { MapPinIcon } from "@/components/brand/icons";

/**
 * Carte profil — comps motema-carte-profil-a/b : photo bord-à-bord,
 * « Prénom, Âge » en Poppins, pin + lieu, bio, actions dans le pied de carte.
 */
export function ProfileCard({
  card,
  actions,
  overlay,
}: {
  card: DiscoveryCard;
  actions?: React.ReactNode;
  overlay?: React.ReactNode;
}) {
  const where =
    card.distanceKm !== null
      ? card.distanceKm <= 1
        ? "à 1 km ou moins"
        : `à ${card.distanceKm} km`
      : card.city
        ? card.city
        : null;

  return (
    <article className="relative flex w-full flex-col overflow-hidden rounded-card border border-ink/10 bg-white shadow-sm">
      {overlay && (
        <div className="absolute right-2 top-2 z-10 rounded-full bg-white/85 backdrop-blur">
          {overlay}
        </div>
      )}
      {card.photoUrl ? (
        <img
          src={card.photoUrl}
          alt={`Photo de ${card.displayName}`}
          className="aspect-[4/5] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[4/5] w-full items-center justify-center bg-disabled text-legend text-ink/60">
          Photo indisponible
        </div>
      )}
      <div className="flex flex-col gap-2 p-6">
        <h2 className="font-display text-h3 text-ink">
          {card.displayName}, {card.age}
        </h2>
        {where && (
          <p className="flex items-center gap-2 text-legend text-ink/70">
            <MapPinIcon className="h-4 w-4" />
            {where}
          </p>
        )}
        {card.bio && (
          <p className="line-clamp-3 text-body text-ink/70">{card.bio}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center justify-center gap-6 border-t border-ink/10 p-6">
          {actions}
        </div>
      )}
    </article>
  );
}
