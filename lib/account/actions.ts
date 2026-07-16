"use server";

import { requireActiveMember } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "profile-photos";

/**
 * Suppression définitive du compte (droit à l'effacement). Ordre :
 *  1. requireActiveMember (un compte déjà 'deleted' est redirigé avant → idempotent)
 *  2. delete_own_account() : scrub PII public.* + clôture des matches actifs +
 *     delete profiles/photos + status='deleted'. BLOQUANT — si ça échoue, on
 *     s'arrête AVANT de toucher au Storage (rien de perdu, retry propre).
 *  3. supprime les objets Storage (session encore valide ; policy folder-owner,
 *     insensible au statut) — best-effort : un échec laisse des orphelins que
 *     le balayage périodique nettoie, sans profil cassé (lignes déjà supprimées).
 *  4. scrub auth.users (email/mot de passe) via service-role — on ne peut pas
 *     hard-delete auth.users (cascade → casserait matches/messages). Best-effort.
 *  5. signOut (efface la session) — best-effort.
 *
 * Renvoie { ok } ; la navigation vers l'écran de confirmation est faite côté
 * client (éviter d'entremêler redirect() serveur et valeur de retour — un
 * redirect résoudrait la promesse à undefined côté client).
 */
export async function deleteAccount(): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireActiveMember();

  // Capture les chemins Storage AVANT que le scrub ne supprime les lignes.
  const { data: photos } = await supabase
    .from("profile_photos")
    .select("storage_path")
    .eq("user_id", user.id);
  const paths = (photos ?? [])
    .map((p) => p.storage_path as string)
    .filter(Boolean);

  // 1) Scrub DB d'abord (bloquant). En cas d'échec, rien n'a été supprimé côté
  //    Storage → l'utilisateur peut réessayer sans profil à moitié cassé.
  const { error: rpcError } = await supabase.rpc("delete_own_account");
  if (rpcError) {
    console.error("delete_own_account failed", rpcError.message);
    return { ok: false };
  }

  // 2) Objets Storage — best-effort (session encore active, policy folder-owner).
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) console.error("account deletion: storage remove failed", error.message);
  }

  // 3) Scrub auth.users (source de l'email/téléphone). Sans service-role, on
  //    dégrade proprement : le scrub public.* est fait, mais l'email réel
  //    subsisterait dans auth.users → à compléter dès que la clé est configurée.
  //    NB : selon la version de GoTrue, auth.identities.identity_data (snapshot
  //    de l'email à l'inscription) peut ne pas être synchronisé par cet update —
  //    à vérifier en staging et à scruber côté DBA/GoTrue si nécessaire.
  const admin = createAdminClient();
  if (admin) {
    const neutralEmail = `deleted+${user.id}@deleted.invalid`;
    const randomPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      email: neutralEmail,
      password: randomPassword,
      user_metadata: {},
      email_confirm: true,
    });
    if (error) console.error("account deletion: auth scrub failed", error.message);
  } else {
    console.error(
      "account deletion: SUPABASE_SERVICE_ROLE_KEY absent — auth.users non scrubé",
    );
  }

  // 4) Coupe la session (efface les cookies) — best-effort : le scrub DB ayant
  //    réussi, la suppression EST effective ; un échec de signOut ne doit pas
  //    afficher « échec » au client. Le client navigue ensuite vers
  //    /account-deleted (route publique).
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error("account deletion: signOut failed", e);
  }
  return { ok: true };
}
