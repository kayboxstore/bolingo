'use client';

/**
 * Bolingo — écran de chargement (splash) de première session.
 *
 * Phase 1 : cœur blanc qui bat (lub-dub) sur fond #FF4B72 pendant HEART_MS.
 * Phase 2 : fondu enchaîné vers le logo, puis le slogan apparaît SLOGAN_DELAY_MS
 *           après le logo et reste jusqu'à la fin (LOGO_MS au total).
 * Puis     : fondu vers l'app. Affiché une seule fois par session (sessionStorage).
 *            « Touchez pour passer » pour zapper. Respecte prefers-reduced-motion.
 *
 * Convention projet : à placer dans components/splash-screen.tsx.
 * Dépendance : framer-motion (npm install framer-motion).
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Logo } from '@/components/brand/logo';

// --- Durées (constantes facilement ajustables) ---------------------------
const HEART_MS = 4000; // Phase 1 : cœur qui bat
const LOGO_MS = 5000; // Phase 2 : à partir de l'apparition du logo
const SLOGAN_DELAY_MS = 2000; // délai du slogan après le logo
const REDUCED_MS = 1500; // version statique (mouvement réduit)
const SESSION_KEY = 'bolingo:splash-seen';
// Dégradé raffiné : rose en haut → blanc cassé chaud en bas.
// Le centre reste franchement rose pour garder le contraste du cœur/logo blancs.
const SPLASH_GRADIENT =
  'linear-gradient(180deg, #FF3D68 0%, #FF4B72 34%, #FF6E8D 60%, #FFB9C7 82%, #FBEFE9 100%)';
const SLOGAN = 'Là où les cœurs se rencontrent';

const HEART_PATH =
  'M23.6 0c-3.4 0-6.3 2-7.6 5C14.7 2 11.8 0 8.4 0 3.8 0 0 3.7 0 8.4c0 8.4 8.5 13 16 20.6C23.5 21.4 32 16.8 32 8.4 32 3.7 28.2 0 23.6 0z';

type Phase = 'heart' | 'logo';

// Pétales dérivant en fond (positions/durées/dérives variées, en %).
const PETALS = [
  { left: '8%', size: 16, dur: 7.5, delay: 0, dx: 34, rot: 300, tone: 'light' },
  { left: '20%', size: 11, dur: 9, delay: 1.4, dx: -28, rot: -220, tone: 'rose' },
  { left: '33%', size: 9, dur: 6.5, delay: 0.6, dx: 22, rot: 200, tone: 'white' },
  { left: '46%', size: 19, dur: 10, delay: 2.2, dx: -40, rot: 280, tone: 'light' },
  { left: '57%', size: 13, dur: 8, delay: 0.3, dx: 30, rot: -260, tone: 'rose' },
  { left: '68%', size: 10, dur: 7, delay: 3, dx: -18, rot: 240, tone: 'white' },
  { left: '78%', size: 15, dur: 9.5, delay: 1, dx: 26, rot: -300, tone: 'light' },
  { left: '88%', size: 12, dur: 8.5, delay: 2.6, dx: -32, rot: 220, tone: 'rose' },
  { left: '14%', size: 8, dur: 11, delay: 4, dx: 20, rot: -200, tone: 'white' },
  { left: '62%', size: 17, dur: 12, delay: 3.6, dx: -24, rot: 320, tone: 'light' },
  { left: '40%', size: 10, dur: 7.8, delay: 5, dx: 36, rot: -240, tone: 'rose' },
  { left: '92%', size: 9, dur: 10.5, delay: 1.8, dx: -20, rot: 260, tone: 'white' },
] as const;

const PETAL_COLOR: Record<string, string> = {
  light: 'rgba(255,255,255,0.72)',
  rose: '#FF8098',
  white: 'rgba(255,255,255,0.9)',
};

function Petals() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      {PETALS.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            background: PETAL_COLOR[p.tone],
            borderRadius: '100% 0 100% 0',
          }}
          initial={{ y: -40, x: 0, rotate: 0, opacity: 0 }}
          animate={{
            y: ['-40px', '110vh'],
            x: [0, p.dx],
            rotate: [0, p.rot],
            opacity: [0, 0.85, 0.85, 0],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            ease: 'linear',
            repeat: Infinity,
            times: [0, 0.12, 0.88, 1],
          }}
        />
      ))}
    </div>
  );
}

function Heart({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={(size * 29) / 32}
      viewBox="0 0 32 29"
      fill="#fff"
      className={className}
      aria-hidden
    >
      <path d={HEART_PATH} />
    </svg>
  );
}

export function SplashScreen() {
  // Montage client uniquement : évite tout mismatch d'hydratation Next.js.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>('heart');
  const [showSlogan, setShowSlogan] = useState(false);
  const prefersReduced = useReducedMotion();

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* sessionStorage indisponible : on ferme quand même */
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return; // déjà vu cette session : ne pas réafficher

    setVisible(true);
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (prefersReduced) {
      // Version statique : logo + slogan, sans battement, ~1,5 s.
      setPhase('logo');
      setShowSlogan(true);
      timers.push(setTimeout(dismiss, REDUCED_MS));
    } else {
      // Phase 1 → Phase 2
      timers.push(
        setTimeout(() => setPhase('logo'), HEART_MS),
        setTimeout(() => setShowSlogan(true), HEART_MS + SLOGAN_DELAY_MS),
        setTimeout(dismiss, HEART_MS + LOGO_MS),
      );
    }

    return () => timers.forEach(clearTimeout);
  }, [prefersReduced, dismiss]);

  // Rien côté serveur ni au premier rendu client → pas de mismatch.
  if (!mounted) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="presentation"
          onClick={dismiss}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex cursor-pointer flex-col items-center justify-center"
          style={{ background: SPLASH_GRADIENT }}
        >
          {!prefersReduced && <Petals />}

          <AnimatePresence mode="wait">
            {phase === 'heart' ? (
              <motion.div
                key="heart"
                className="relative z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
              >
                <motion.div
                  // « lub-dub » : battement rapide, retour, second plus léger, pause.
                  animate={
                    prefersReduced
                      ? undefined
                      : { scale: [1, 1.17, 1, 1.09, 1, 1] }
                  }
                  transition={{
                    duration: 1.25,
                    times: [0, 0.09, 0.19, 0.29, 0.4, 1],
                    ease: 'easeInOut',
                    repeat: Infinity,
                  }}
                >
                  <Heart size={92} />
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="logo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.85, ease: 'easeInOut' }}
                className="relative z-10 flex flex-col items-center"
              >
                {/* Logo existant réutilisé — variante blanche sur fond rose. */}
                <Logo variant="white" asLink={false} className="h-12 w-auto" />
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: showSlogan ? 1 : 0 }}
                  transition={{ duration: 0.9, ease: 'easeInOut' }}
                  className="mt-4 text-center text-base text-white/90"
                >
                  {SLOGAN}
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          <span className="pointer-events-none absolute bottom-9 text-sm font-semibold text-[#C21D47]">
            Touchez pour passer
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SplashScreen;
