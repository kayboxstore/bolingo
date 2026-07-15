import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Garde unique des surfaces réservées aux membres actifs (découverte, matches,
 * et à venir). Source de vérité — ne jamais réinliner ces vérifications par
 * page/action (la duplication a déjà causé un trou : compte suspendu gardant
 * l'accès en lecture).
 *
 * Redirige : non authentifié → /login ; email non vérifié → /verify-email ;
 * compte suspendu/supprimé → déconnexion + /login ; flag mineur →
 * /onboarding/blocked ; profil incomplet → /onboarding.
 */
export async function requireActiveMember() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/verify-email");

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
  if (account && account.status !== "active") {
    await supabase.auth.signOut();
    redirect("/login");
  }
  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  return { supabase, user };
}
