import { createBrowserClient } from "@supabase/ssr";

/**
 * ⚠️ Client navigateur ANONYME UNIQUEMENT.
 *
 * Les cookies de session sont `httpOnly` (voir lib/supabase/server.ts) : ce
 * client ne peut PAS lire la session — `auth.getUser()` renverra toujours
 * null ici. Toute opération authentifiée passe par les Server Components,
 * Server Actions ou Route Handlers. Si un futur besoin client (Realtime…)
 * exige la session côté navigateur, la stratégie cookies devra être revue.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
