import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodeCity, type GeocodeResult } from "@/lib/onboarding/geocode";

/**
 * Autocomplete de villes (proxy Nominatim, côté serveur uniquement).
 * Réservé aux utilisateurs authentifiés + throttle et cache : la politique
 * Nominatim impose ≤ 1 req/s PAR APPLICATION — un ban toucherait tout le monde.
 *
 * NB : limiteur en mémoire — par instance serveur. Suffisant en MVP ;
 * passer sur un KV partagé (Upstash…) avant une montée en charge sérieuse.
 */

const cache = new Map<string, { results: GeocodeResult[]; at: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const perUserLastCall = new Map<string, number>();
const USER_MIN_INTERVAL_MS = 700;
let lastUpstreamCall = 0;
const GLOBAL_MIN_INTERVAL_MS = 1000;

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 120) {
    return NextResponse.json({ results: [] });
  }

  const key = query.toLowerCase();
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ results: publicResults(cached.results) });
  }

  // Throttle par utilisateur puis global (protège l'IP partagée du serveur).
  const lastUser = perUserLastCall.get(user.id) ?? 0;
  if (now - lastUser < USER_MIN_INTERVAL_MS) {
    return NextResponse.json({ results: [] }, { status: 429 });
  }
  if (now - lastUpstreamCall < GLOBAL_MIN_INTERVAL_MS) {
    return NextResponse.json({ results: [] }, { status: 429 });
  }
  perUserLastCall.set(user.id, now);
  lastUpstreamCall = now;

  try {
    const results = await geocodeCity(query, 5);
    cache.set(key, { results, at: now });
    if (cache.size > 500) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    return NextResponse.json({ results: publicResults(results) });
  } catch {
    // L'autocomplete est un confort : silencieux en cas d'échec.
    return NextResponse.json({ results: [] });
  }
}

function publicResults(results: GeocodeResult[]) {
  return results.map(({ label, city, latitude, longitude }) => ({
    label,
    city,
    latitude,
    longitude,
  }));
}
