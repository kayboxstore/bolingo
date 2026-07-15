import Link from "next/link";
import { HeartIcon } from "@/components/brand/logo";

/** Landing minimale — les utilisateurs connectés sont redirigés par le middleware. */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      {/* Lockup de la charte à l'échelle héro : construction identique à <Logo /> */}
      <div className="flex items-center gap-2">
        <HeartIcon className="h-10 w-10 text-accent" />
        <h1 className="font-display text-h1 lowercase tracking-tight text-ink">bolingo</h1>
      </div>
      <p className="max-w-md text-body text-ink/70">Là où les cœurs se rencontrent.</p>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Link
          href="/signup"
          className="rounded-btn bg-brand px-6 py-4 font-display font-semibold text-brand-fg transition hover:bg-brand-hover"
        >
          S&apos;inscrire
        </Link>
        <Link
          href="/login"
          className="rounded-btn border border-ink/15 px-6 py-4 font-display font-semibold text-ink transition hover:border-ink/40"
        >
          Se connecter
        </Link>
      </div>
    </main>
  );
}
