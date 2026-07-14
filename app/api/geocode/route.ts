import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodeCity } from "@/lib/onboarding/geocode";

/**
 * Autocomplete de villes (proxy Nominatim, côté serveur uniquement).
 * Réservé aux utilisateurs authentifiés — pas un géocodeur public.
 */
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

  try {
    const results = await geocodeCity(query, 5);
    return NextResponse.json({
      results: results.map(({ label, city }) => ({ label, city })),
    });
  } catch {
    // L'autocomplete est un confort : silencieux en cas d'échec.
    return NextResponse.json({ results: [] });
  }
}
