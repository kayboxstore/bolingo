import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveMember } from "@/lib/auth/guards";
import { loadMatches } from "@/lib/matches/queries";
import { AppHeader } from "@/components/app-header";
import { MatchList } from "@/components/matches/match-list";
import { MarkSeen } from "@/components/matches/mark-seen";
import { HeartIcon } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Mes matches" };

export default async function MatchesPage() {
  await requireActiveMember();

  const matches = await loadMatches();
  const hasUnseen = matches.some((m) => m.isNew);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Effet client : ne mute jamais pendant le rendu du Server Component. */}
      <MarkSeen hasUnseen={hasUnseen} />
      <AppHeader nav unseenMatches={0} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
        <h1 className="font-display text-h2 text-ink">Mes matches</h1>
        {matches.length > 0 ? (
          <MatchList initial={matches} />
        ) : (
          <div className="flex flex-col items-center gap-6 rounded-card border border-ink/10 bg-white p-6 text-center shadow-sm">
            <HeartIcon className="h-12 w-12 text-accent" />
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-h3 text-ink">
                Pas encore de match
              </h2>
              <p className="text-body text-ink/70">
                Continue à explorer : chaque like est une chance.
              </p>
            </div>
            <Link
              href="/discover"
              className="w-full rounded-btn bg-brand px-4 py-4 text-center font-display text-body font-semibold text-brand-fg transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Continuer à explorer
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
