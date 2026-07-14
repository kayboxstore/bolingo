import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadDiscoveryBatch } from "@/lib/discover/queries";
import { countUnseenMatches } from "@/lib/matches/queries";
import { AppHeader } from "@/components/app-header";
import { DiscoverDeck } from "@/components/discover/deck";
import { DiscoveryFilters } from "@/components/discover/filters";

export const metadata: Metadata = { title: "Découvrir" };

export default async function DiscoverPage() {
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
      .select("onboarding_completed_at, max_distance_km, age_min, age_max")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (account?.underage_attempted_at) redirect("/onboarding/blocked");
  // Prérequis produit : profil complet avant la découverte.
  if (!profile?.onboarding_completed_at) redirect("/onboarding");

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
