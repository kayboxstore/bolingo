"use client";

import { forwardRef, useCallback, useImperativeHandle } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimationControls,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";

export type SwipeHandle = { swipe: (verdict: "like" | "pass") => void };

// Seuil de décision : déplacement (px) + une part de la vélocité (un flick
// rapide mais court compte autant qu'un glissement lent et long).
const THRESHOLD = 120;

/**
 * Enveloppe le deck d'une carte avec une physique de swipe (Framer Motion) :
 * inclinaison proportionnelle au drag, retour élastique au centre sous le seuil,
 * envoi (fling) au-delà. Les boutons Passer/Aimer pilotent la MÊME trajectoire
 * via un handle impératif. `prefers-reduced-motion` → aucune animation : le drag
 * est désactivé et la décision est prise instantanément par les boutons.
 */
export const SwipeCard = forwardRef<
  SwipeHandle,
  {
    children: React.ReactNode;
    onDecision: (verdict: "like" | "pass") => void;
    disabled?: boolean;
  }
>(function SwipeCard({ children, onDecision, disabled }, ref) {
  const prefersReduced = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 0, 240], [-14, 0, 14]);
  const likeOpacity = useTransform(x, [40, 130], [0, 1]);
  const nopeOpacity = useTransform(x, [-130, -40], [1, 0]);
  const controls = useAnimationControls();

  const fling = useCallback(
    (verdict: "like" | "pass") => {
      if (disabled) return;
      if (prefersReduced) {
        onDecision(verdict);
        return;
      }
      const dir = verdict === "like" ? 1 : -1;
      controls
        .start({
          x: dir * 700,
          opacity: 0,
          transition: { duration: 0.3, ease: "easeOut" },
        })
        .then(() => onDecision(verdict));
    },
    [controls, disabled, prefersReduced, onDecision],
  );

  useImperativeHandle(ref, () => ({ swipe: fling }), [fling]);

  function onDragEnd(_event: unknown, info: PanInfo) {
    const power = info.offset.x + info.velocity.x * 0.12;
    if (power > THRESHOLD) fling("like");
    else if (power < -THRESHOLD) fling("pass");
    // Sous le seuil : retour élastique au centre.
    else controls.start({ x: 0, transition: { type: "spring", stiffness: 500, damping: 34 } });
  }

  // Mouvement réduit : pas de drag, les boutons décident (statique).
  if (prefersReduced) {
    return <div className="relative">{children}</div>;
  }

  return (
    <motion.div
      className="relative touch-pan-y"
      style={{ x, rotate }}
      drag={disabled ? false : "x"}
      dragElastic={0.6}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={onDragEnd}
      animate={controls}
      whileTap={{ cursor: "grabbing" }}
    >
      {/* Tampons d'intention, révélés proportionnellement au drag (bord photo,
          sous le menu ⋯). Non-textuels critiques : bordure + token de couleur. */}
      <motion.div
        style={{ opacity: likeOpacity }}
        aria-hidden
        className="pointer-events-none absolute left-4 top-6 z-20 -rotate-12 rounded-btn border-2 border-accent px-3 py-1 font-display text-body font-semibold text-accent"
      >
        J&apos;aime
      </motion.div>
      <motion.div
        style={{ opacity: nopeOpacity }}
        aria-hidden
        className="pointer-events-none absolute right-4 top-6 z-20 rotate-12 rounded-btn border-2 border-ink px-3 py-1 font-display text-body font-semibold text-ink"
      >
        Passer
      </motion.div>
      {children}
    </motion.div>
  );
});
