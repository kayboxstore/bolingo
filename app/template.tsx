"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Transition de page (App Router : `template.tsx` se remonte à chaque
 * navigation, contrairement à `layout.tsx`). Fade + léger glissement vers le
 * haut à l'arrivée sur une route — pas de mouvement sur les clics internes.
 * `prefers-reduced-motion` → rendu statique (aucune animation).
 *
 * Coût volontairement minimal (opacité + translate, ~0,22 s) pour ne pas peser
 * sur le bas de gamme Android. Le splash (hors template) masque le tout premier
 * rendu, donc pas de flash au chargement initial.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
