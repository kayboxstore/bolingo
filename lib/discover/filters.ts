// Constantes et types partagés des filtres de découverte. Module NEUTRE (pas de
// "use server") : les Server Actions ne peuvent exporter que des fonctions async,
// donc bornes et types vivent ici et sont importés par l'action ET les composants.

// Borne distance UI = celle déjà en place à la brique Découverte (max RADII).
// Le serveur ne l'assouplit jamais : un filtre ne peut pas dépasser cette borne
// géographique, même si l'UI est contournée.
export const DISTANCE_MAX_KM = 250;
export const AGE_MIN = 18; // plancher légal — indépassable côté serveur
export const AGE_MAX = 99;

export type DiscoveryFilters = {
  maxDistanceKm: number;
  ageMin: number;
  ageMax: number;
  interestedIn: string[];
};
