import { createClient } from "@/lib/supabase/server";

export type BlockedUser = {
  userId: string;
  displayName: string | null;
  photoUrl: string | null;
  blockedAt: string;
};

type BlockedRow = {
  blocked_id: string;
  display_name: string | null;
  photo_path: string | null;
  blocked_at: string;
};

/** Comptes bloqués par l'utilisateur, avec nom/photo (RPC DEFINER list_blocked). */
export async function loadBlocked(): Promise<BlockedUser[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_blocked");
  if (error || !data) return [];
  const rows = data as BlockedRow[];

  const paths = rows
    .map((r) => r.photo_path)
    .filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage
      .from("profile-photos")
      .createSignedUrls(paths, 900);
    urls?.forEach((u, i) => u.signedUrl && signed.set(paths[i], u.signedUrl));
  }

  return rows.map((r) => ({
    userId: r.blocked_id,
    displayName: r.display_name,
    photoUrl: r.photo_path ? (signed.get(r.photo_path) ?? null) : null,
    blockedAt: r.blocked_at,
  }));
}
