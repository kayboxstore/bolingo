import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Compte supprimé",
  robots: { index: false, follow: false },
};

export default function AccountDeletedPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex items-center px-6 py-4">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-8 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-h2 text-ink">Compte supprimé</h1>
          <p className="text-body text-ink/70">
            Ton compte et tes données personnelles ont été supprimés. Merci
            d&apos;avoir utilisé Bolingo — la porte reste ouverte si tu souhaites
            revenir un jour.
          </p>
        </div>
        <Link
          href="/"
          className="w-full rounded-btn bg-brand px-4 py-4 text-center font-display text-body font-semibold text-brand-fg transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Retour à l&apos;accueil
        </Link>
      </main>
    </div>
  );
}
