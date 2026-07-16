import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase à privilèges service-role — SERVEUR UNIQUEMENT.
 * `server-only` fait échouer le build si ce module est importé côté client.
 *
 * Contourne la RLS : à réserver aux opérations d'administration qui ne peuvent
 * PAS passer par la session utilisateur — aujourd'hui, le scrub de `auth.users`
 * lors de la suppression de compte (l'email/téléphone réels y vivent ; la RPC
 * DEFINER ne touche que `public.*`). Jamais importé dans un composant client.
 *
 * Renvoie null si la clé service-role n'est pas configurée : l'appelant doit
 * dégrader proprement (le scrub `public.*` reste fait), sans planter.
 */
export function createAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
