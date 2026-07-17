"use server";

import { requireActiveMember } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "exports";
const SIGNED_TTL_S = 1800; // 30 min — cohérent avec les URLs signées courtes.

export type ExportResult =
  | { ok: true; url: string }
  | { ok: false; error: "rate_limited" | "unavailable" | "failed" };

/**
 * Export RGPD (portabilité). export_my_data() applique le rate-limit atomique
 * (1/heure) AVANT d'assembler — donc une demande throttlée ne fait aucun travail
 * Storage. On dépose ensuite le JSON dans le bucket privé `exports` (service-role)
 * et on renvoie une URL signée à durée limitée. Compte supprimé/suspendu déjà
 * bloqué par requireActiveMember.
 */
export async function requestDataExport(): Promise<ExportResult> {
  const { supabase, user } = await requireActiveMember();

  const admin = createAdminClient();
  if (!admin) {
    console.error("data export: SUPABASE_SERVICE_ROLE_KEY absent");
    return { ok: false, error: "unavailable" };
  }

  const { data: json, error: rpcError } = await supabase.rpc("export_my_data");
  if (rpcError || !json) {
    const rateLimited = (rpcError?.message ?? "")
      .toLowerCase()
      .includes("rate limited");
    if (!rateLimited) console.error("export_my_data failed", rpcError?.message);
    return { ok: false, error: rateLimited ? "rate_limited" : "failed" };
  }

  // NB : si le process échoue entre cet upload et la génération de l'URL, le
  // fichier reste orphelin dans `exports` — nettoyé sous 24 h par le job cron
  // (borne connue ; le rate-limit a déjà été consommé côté RPC).
  const path = `${user.id}/${crypto.randomUUID()}.json`;
  const body = JSON.stringify(json, null, 2);
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, body, { contentType: "application/json", upsert: false });
  if (upErr) {
    console.error("data export: upload failed", upErr.message);
    return { ok: false, error: "failed" };
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
