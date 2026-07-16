import type { Metadata } from "next";
import { requireActiveMember } from "@/lib/auth/guards";
import { loadBlocked } from "@/lib/moderation/queries";
import { AppHeader } from "@/components/app-header";
import { VisibilityToggle } from "@/components/settings/visibility-toggle";
import { BlockedList } from "@/components/settings/blocked-list";

export const metadata: Metadata = { title: "Réglages" };

export default async function SettingsPage() {
  const { supabase, user } = await requireActiveMember();

  const [{ data: profile }, blocked] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_visible")
      .eq("user_id", user.id)
      .single(),
    loadBlocked(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <AppHeader nav />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-6 py-8">
        <h1 className="font-display text-h2 text-ink">Réglages</h1>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-h3 text-ink">Visibilité</h2>
          <VisibilityToggle initialVisible={profile?.is_visible ?? true} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-h3 text-ink">Comptes bloqués</h2>
          <BlockedList initial={blocked} />
        </section>
      </main>
    </div>
  );
}
