/* eslint-disable @next/next/no-img-element -- URLs signées éphémères, hors next/image */

import type { DiscoveryCard } from "@/lib/discover/queries";

/** Carte profil — photo portrait bord-à-bord, infos en pied (comps charte). */
export function ProfileCard({ card }: { card: DiscoveryCard }) {
  const where =
    card.distanceKm !== null
      ? card.distanceKm <= 1
        ? "à moins de 1 km"
        : `à ${card.distanceKm} km`
      : card.city
        ? card.city
        : null;

  return (
    <article className="flex w-full flex-col overflow-hidden rounded-card border border-ink/10 bg-white shadow-sm">
      {card.photoUrl ? (
        <img
          src={card.photoUrl}
          alt={`Photo de ${card.displayName}`}
          className="aspect-[3/4] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center bg-disabled text-legend text-ink/60">
          Photo indisponible
        </div>
      )}
      <div className="flex flex-col gap-2 p-6">
        <h2 className="font-display text-h3 text-ink">
          {card.displayName}
          <span className="font-sans text-body text-ink/70"> · {card.age} ans</span>
        </h2>
        {where && <p className="text-legend text-ink/70">{where}</p>}
        {card.bio && (
          <p className="line-clamp-3 text-body text-ink/70">{card.bio}</p>
        )}
      </div>
    </article>
  );
}
