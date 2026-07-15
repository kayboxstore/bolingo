import Link from "next/link";

/**
 * Cœur Bolingo — contour 2 px, terminaisons arrondies. Couleur via
 * `currentColor` : rose vif (`text-accent`) par défaut d'usage (charte),
 * blanc uniquement sur fond rose vif (bouton Like, cf. comp carte-profil-a).
 * Dans le lockup logo : jamais recoloré (règle charte 01).
 */
export function HeartIcon({
  className = "h-6 w-6 text-accent",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* trait constant 2 px quelle que soit la taille de rendu (charte 05) */}
      <path
        vectorEffect="non-scaling-stroke"
        d="M12 20.5c-.4 0-4.8-2.9-7.2-5.9C3 12.3 2.5 9.6 4 7.6a4.6 4.6 0 0 1 7.3-.2l.7.9.7-.9a4.6 4.6 0 0 1 7.3.2c1.5 2 1 4.7-.8 7-2.4 3-6.8 5.9-7.2 5.9Z"
      />
    </svg>
  );
}

/** Lockup principal : cœur + wordmark. Largeur min. 96 px (charte). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex min-w-24 items-center gap-2 ${className}`}
      aria-label="Bolingo — accueil"
    >
      {/* 24 px : grille icônes + zone de protection 1× cœur respectée avec gap-6 */}
      <HeartIcon className="h-6 w-6 text-accent" />
      <span className="font-display text-2xl font-bold lowercase tracking-tight text-ink">
        bolingo
      </span>
    </Link>
  );
}
