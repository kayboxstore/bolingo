"use client";

import { useEffect } from "react";
import { markMatchesSeen } from "@/lib/matches/actions";

/**
 * Marque les matches comme vus au montage (effet client — jamais une mutation
 * pendant le rendu d'un Server Component). Les badges « Nouveau » du rendu
 * courant restent visibles ; c'est le compteur des prochaines visites qui
 * retombe à zéro. Ne rend rien.
 */
export function MarkSeen({ hasUnseen }: { hasUnseen: boolean }) {
  useEffect(() => {
    if (hasUnseen) void markMatchesSeen();
  }, [hasUnseen]);
  return null;
}
