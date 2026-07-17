"use client";

import { useState } from "react";
import type { DiscoveryFilters } from "@/lib/discover/filters";
import type { DiscoveryBatch } from "@/lib/discover/queries";
import { DiscoveryFiltersPanel } from "@/components/discover/filters";
import { DiscoverDeck } from "@/components/discover/deck";

/**
 * Coordonne le panneau de filtres et le deck. À l'application d'un filtre, on
 * remplace le lot et on incrémente une clé de génération : le deck est remonté
 * proprement avec le lot frais (sa logique interne de refill/like est intacte),
 * sans navigation ni reload de page.
 */
export function DiscoverClient({
  initialBatch,
  initialFilters,
}: {
  initialBatch: DiscoveryBatch;
  initialFilters: DiscoveryFilters;
}) {
  const [batch, setBatch] = useState(initialBatch);
  const [filters, setFilters] = useState(initialFilters);
  const [generation, setGeneration] = useState(0);

  function onApplied(nextBatch: DiscoveryBatch, nextFilters: DiscoveryFilters) {
    setFilters(nextFilters);
    setBatch(nextBatch);
    setGeneration((g) => g + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <DiscoveryFiltersPanel defaults={filters} onApplied={onApplied} />
      <DiscoverDeck key={generation} initial={batch} />
    </div>
  );
}
