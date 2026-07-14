import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Accès non autorisé" };

/** Écran de blocage légal — moins de 18 ans. Définitif. */
export default async function BlockedPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("users")
    .select("underage_attempted_at")
    .eq("id", user.id)
    .single();
  if (!account?.underage_attempted_at) redirect("/onboarding");

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="font-display text-h2 text-ink">
          Motema est réservé aux adultes
        </h1>
        <p className="text-body text-ink/70">
          Tu dois avoir 18 ans révolus pour utiliser Motema. La création de
          profil est définitivement bloquée pour ce compte et aucune donnée de
          profil n&apos;est conservée.
        </p>
        <p className="text-legend text-ink/70">
          Tu penses qu&apos;il s&apos;agit d&apos;une erreur ? Contacte le
          support.
        </p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-btn border border-ink/15 px-6 py-4 font-display font-semibold text-ink transition hover:border-ink/40"
        >
          Se déconnecter
        </button>
      </form>
    </section>
  );
}
