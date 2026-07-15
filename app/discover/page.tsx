import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveMember } from "@/lib/auth/guards";
import { loadDiscoveryBatch } from "@/lib/discover/queries";
import { countUnseenMatches } from "@/lib/matches/queries";
import { AppHeader } from "@/components/app-header";
import { DiscoverDeck } from "@/components/discover/deck";
import { DiscoveryFilters } from "@/components/discover/filters";

export const metadata: Metadata = { title: "Découvrir" };

export default async function DiscoverPage() {
  // Garde partagé : auth + vérifié + actif + non-flagué + profil complet.
  const { supabase, user } = await requireActiveMember();

  const { data: profile } = await supabase
    .from("profiles")
    .select("max_distance_km, age_min, age_max")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const [batch, unseenMatches] = await Promise.all([
    loadDiscoveryBatch(),
    countUnseenMatches(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <AppHeader nav unseenMatches={unseenMatches} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
        <h1 className="sr-only">Découvrir</h1>
        <DiscoveryFilters
          defaults={{
            maxDistanceKm: profile.max_distance_km,
            ageMin: profile.age_min,
            ageMax: profile.age_max,
          }}
        />
        <DiscoverDeck
          initial={batch}
          key={`${profile.max_distance_km}-${profile.age_min}-${profile.age_max}`}
        />
      </main>
    </div>
  );
}
