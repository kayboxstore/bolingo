import Link from "next/link";

/**
 * Cœur Motema — contour 2 px, terminaisons arrondies, rose vif (#FF4B72).
 * Charte : ne pas déformer, ne pas recolorer, pas d'ombre portée.
 */
export function HeartIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-accent ${className}`}
      aria-hidden="true"
    >
      <path d="M12 20.5c-.4 0-4.8-2.9-7.2-5.9C3 12.3 2.5 9.6 4 7.6a4.6 4.6 0 0 1 7.3-.2l.7.9.7-.9a4.6 4.6 0 0 1 7.3.2c1.5 2 1 4.7-.8 7-2.4 3-6.8 5.9-7.2 5.9Z" />
    </svg>
  );
}

/** Lockup principal : cœur + wordmark. Largeur min. 96 px (charte). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex min-w-24 items-center gap-2 ${className}`}
      aria-label="Motema — accueil"
    >
      <HeartIcon className="h-7 w-7" />
      <span className="font-display text-2xl font-bold lowercase tracking-tight text-ink">
        motema
      </span>
    </Link>
  );
}
