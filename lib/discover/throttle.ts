import "server-only";

// Limiteur de fréquence par-utilisateur pour le hot-path de découverte
// (rechargement de lots + application de filtres). Chaque appel déclenche un
// scan GiST + jointures + signature d'URLs de photos d'autrui : sans plafond,
// un compte authentifié peut moissonner en masse (photos signées, bio, ville,
// distance) en appelant directement les Server Actions, hors du garde-fou UI.
//
// Fenêtre glissante en mémoire — PAR INSTANCE serveur. Suffisant en MVP ;
// migrer vers un KV partagé (Upstash…) avant montée en charge, comme documenté
// dans CLAUDE.md et le limiteur de /api/geocode.

const WINDOW_MS = 10_000;
const MAX_CALLS = 30; // large pour un usage humain (swipe/ajustements), borne l'abus
const hits = new Map<string, number[]>();

/** true si l'appel est autorisé ; false s'il dépasse le quota de la fenêtre. */
export function allowDiscovery(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_CALLS) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);

  // Nettoyage opportuniste des entrées expirées (borne la taille de la Map).
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      const live = times.filter((t) => now - t < WINDOW_MS);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
  }
  return true;
}
