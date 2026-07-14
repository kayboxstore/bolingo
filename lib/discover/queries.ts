import { createClient } from "@/lib/supabase/server";

export type DiscoveryCard = {
  userId: string;
  displayName: string;
  age: number;
  distanceKm: number | null;
  city: string | null;
  bio: string | null;
  /** URL signée éphémère (15 min) — jamais de chemin storage brut au client. */
  photoUrl: string | null;
};

export type DiscoveryBatch = {
  cards: DiscoveryCard[];
  /** Plus aucun candidat côté serveur (le deck client peut encore en avoir). */
  exhausted: boolean;
};

export const BATCH_SIZE = 10;

type DiscoverRow = {
  user_id: string;
  display_name: string;
  age: number;
  bio: string | null;
  city: string | null;
  distance_km: number | null;
  primary_photo_path: string | null;
};

/**
 * Charge un lot de profils à découvrir. La RPC est SECURITY INVOKER : la RLS
 * s'applique, et elle ne renvoie jamais de coordonnées — seulement une
 * distance arrondie au km.
 */
export async function loadDiscoveryBatch(
  exclude: string[] = [],
): Promise<DiscoveryBatch> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("discover_profiles", {
    batch_size: BATCH_SIZE,
    exclude,
  });
  if (error || !data) return { cards: [], exhausted: true };

  const rows = data as DiscoverRow[];
  const paths = rows
    .map((row) => row.primary_photo_path)
    .filter((p): p is string => Boolean(p));

  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("profile-photos")
      .createSignedUrls(paths, 900);
    signed?.forEach((entry, index) => {
      if (entry.signedUrl) signedByPath.set(paths[index], entry.signedUrl);
    });
  }

  const cards: DiscoveryCard[] = rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    age: row.age,
    distanceKm: row.distance_km,
    city: row.city,
    bio: row.bio,
    photoUrl: row.primary_photo_path
      ? (signedByPath.get(row.primary_photo_path) ?? null)
      : null,
  }));

  return { cards, exhausted: cards.length < BATCH_SIZE };
}
