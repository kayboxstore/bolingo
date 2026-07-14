import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadMatches } from "@/lib/matches/queries";
import { AppHeader } from "@/components/app-header";
import { MatchList } from "@/components/matches/match-list";
import { HeartIcon } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Mes matches" };

export default async function MatchesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: account }, { data: profile }] = await Promise.all([
    supabase
      .from("users")
      .select("underage_attempted_at, status")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (account?.underage_attempted_at) redirect("/onboarding/blocked");
  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  const matches = await loadMatches();

  // Les badges « Nouveau » de CE rendu restent affichés ; le compteur du
  // header est remis à zéro pour les visites suivantes.
  if (matches.some((m) => m.isNew)) {
    await supabase.rpc("mark_matches_seen");
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
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
              className="w-full rounded-btn bg-brand px-4 py-4 text-center font-display text-body font-semibold text-brand-fg transition hover:bg-brand-hover"
            >
              Continuer à explorer
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
