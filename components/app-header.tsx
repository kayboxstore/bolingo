import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/lib/auth/actions";

/**
 * En-tête applicatif commun. `nav` s'affiche pour les profils complets ;
 * `unseenMatches` pose une pastille accent sur « Matches » (notification
 * in-app de nouveau match).
 */
export function AppHeader({
  nav = false,
  unseenMatches = 0,
}: {
  nav?: boolean;
  unseenMatches?: number;
}) {
  return (
    <header className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
      <Logo />
      <div className="flex items-center gap-4">
        {nav && (
          <nav className="flex items-center gap-4" aria-label="Navigation principale">
            <Link
              href="/discover"
              className="-m-2 rounded-btn p-2 text-legend text-ink/70 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Découvrir
            </Link>
            <Link
              href="/matches"
              className="relative -m-2 rounded-btn p-2 text-legend text-ink/70 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Matches
              {unseenMatches > 0 && (
                <>
                  <span
                    className="absolute right-0 top-0 h-2 w-2 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                  <span className="sr-only">
                    {" "}
                    ({unseenMatches} {unseenMatches > 1 ? "nouveaux" : "nouveau"})
                  </span>
                </>
              )}
            </Link>
          </nav>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="-m-2 rounded-btn p-2 text-legend text-ink/70 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </header>
  );
}
