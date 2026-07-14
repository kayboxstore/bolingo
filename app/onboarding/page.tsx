import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { HeartIcon, Logo } from "@/components/brand/logo";
import { signOut } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Bienvenue" };

/**
 * Placeholder post-vérification. La vraie création de profil (photos, bio,
 * préférences) est la brique suivante.
 */
export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
        <Logo />
        <form action={signOut}>
          <button
            type="submit"
            className="text-legend font-medium text-ink/60 underline-offset-2 hover:underline"
          >
            Se déconnecter
          </button>
        </form>
      </header>
      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <HeartIcon className="h-12 w-12" />
        <div className="flex max-w-md flex-col gap-2">
          <h1 className="font-display text-h2 text-ink">Bienvenue sur Motema</h1>
          <p className="text-body text-ink/70">
            Ton compte {user?.email && <strong className="text-ink">{user.email}</strong>} est
            vérifié. Prochaine étape : complète ton profil pour commencer les
            rencontres — cette partie arrive très bientôt.
          </p>
        </div>
        <span className="rounded-btn bg-disabled px-4 py-3 font-display text-body font-semibold text-ink/40">
          Complète ton profil — à venir
        </span>
      </section>
    </main>
  );
}
