import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Variante NON redirigeante de requireActiveMember, pour les contextes où un
 * `redirect()` n'a pas de sens (route SSE / handlers renvoyant du non-HTML).
 * Renvoie null si l'appelant n'est pas un membre actif au profil complet.
 */
export async function getActiveMemberOrNull(): Promise<{
  supabase: SupabaseClient;
  user: User;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email_confirmed_at) return null;

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

  if (
    !account ||
    account.underage_attempted_at ||
    account.status !== "active" ||
    !profile?.onboarding_completed_at
  ) {
    return null;
  }
  return { supabase, user };
}

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
