"use server";

import { requireActiveMember } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "exports";
const SIGNED_TTL_S = 1800; // 30 min — cohérent avec les URLs signées courtes.

export type ExportResult =
  | { ok: true; url: string }
  | { ok: false; error: "rate_limited" | "unavailable" | "failed" };

/**
 * Export RGPD (portabilité). Génère un JSON des données de l'appelant, le
 * dépose dans le bucket privé `exports` (via service-role), et renvoie une URL
 * signée à durée limitée. Rate-limité (1 / heure). Un compte supprimé est déjà
 * bloqué par requireActiveMember (status != active).
 */
export async function requestDataExport(): Promise<ExportResult> {
  const { supabase, user } = await requireActiveMember();

  // Pré-check anti-spam (le vrai verrou atomique est record_data_export).
  const { data: recent } = await supabase
    .from("data_exports")
    .select("id")
    .eq("user_id", user.id)
    .gt("created_at", new Date(Date.now() - 3600_000).toISOString())
    .limit(1);
  if (recent && recent.length > 0) return { ok: false, error: "rate_limited" };

  const admin = createAdminClient();
  if (!admin) {
    console.error("data export: SUPABASE_SERVICE_ROLE_KEY absent");
    return { ok: false, error: "unavailable" };
  }

  const { data: json, error: rpcError } = await supabase.rpc("export_my_data");
  if (rpcError || !json) {
    console.error("export_my_data failed", rpcError?.message);
    return { ok: false, error: "failed" };
  }

  const path = `${user.id}/${crypto.randomUUID()}.json`;
  const body = JSON.stringify(json, null, 2);
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, body, { contentType: "application/json", upsert: false });
  if (upErr) {
    console.error("data export: upload failed", upErr.message);
    return { ok: false, error: "failed" };
  }

  // Verrou atomique du rate-limit (ferme la course du pré-check). En cas de
  // course perdue, on nettoie le fichier tout juste uploadé.
  const { error: recErr } = await supabase.rpc("record_data_export", {
    p_path: path,
  });
  if (recErr) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "rate_limited" };
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL_S, { download: "bolingo-export.json" });
  if (signErr || !signed) {
    console.error("data export: sign failed", signErr?.message);
    return { ok: false, error: "failed" };
  }

  return { ok: true, url: signed.signedUrl };
}
