/**
 * Géocodage via Nominatim (OpenStreetMap) — gratuit, sans clé API.
 * Politique d'usage : User-Agent identifiant, ≤ 1 req/s (l'autocomplete est
 * déjà "debounced" côté client ; le volume MVP reste très en dessous).
 */

export type GeocodeResult = {
  label: string;
  city: string;
  latitude: number;
  longitude: number;
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Motema/0.1 (contact: kayboxstore@gmail.com)";

type NominatimItem = {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
};

export async function geocodeCity(
  query: string,
  limit = 5,
): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    // villes/communes uniquement — pas d'adresses précises
    featureType: "city",
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr" },
    // le géocodage ne doit jamais bloquer longtemps le parcours
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`geocoding failed: HTTP ${response.status}`);
  }

  const items = (await response.json()) as NominatimItem[];
  return items
    .map((item) => {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      const city =
        item.address?.city ??
        item.address?.town ??
        item.address?.village ??
        item.address?.municipality ??
        item.name ??
        "";
      if (!city || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return null;
      }
      return {
        label: item.display_name ?? city,
        city,
        latitude,
        longitude,
      };
    })
    .filter((r): r is GeocodeResult => r !== null);
}
