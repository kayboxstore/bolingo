import { createClient } from "@/lib/supabase/server";

export type MatchItem = {
  matchId: string;
  otherUserId: string;
  displayName: string | null;
  photoUrl: string | null;
  matchedAt: string;
  isNew: boolean;
  profileAvailable: boolean;
};

type MatchRow = {
  match_id: string;
  other_user_id: string;
  display_name: string | null;
  photo_path: string | null;
  matched_at: string;
  is_new: boolean;
  profile_available: boolean;
};

/** Liste des matches actifs (RPC DEFINER — source : table matches uniquement). */
export async function loadMatches(): Promise<MatchItem[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("list_matches");
  if (error || !data) return [];
  const rows = data as MatchRow[];

  const paths = rows
    .map((row) => row.photo_path)
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

  return rows.map((row) => ({
    matchId: row.match_id,
    otherUserId: row.other_user_id,
    displayName: row.display_name,
    photoUrl: row.photo_path
      ? (signedByPath.get(row.photo_path) ?? null)
      : null,
    matchedAt: row.matched_at,
    isNew: row.is_new,
    profileAvailable: row.profile_available,
  }));
}

/** Nombre de matches pas encore vus (badge du header). */
export async function countUnseenMatches(): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase.rpc("list_matches");
  if (!data) return 0;
  return (data as MatchRow[]).filter((row) => row.is_new).length;
}
