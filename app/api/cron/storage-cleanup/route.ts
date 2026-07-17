import { type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrphanRow = { bucket: string; path: string };

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Nettoyage périodique du Storage (déclenché par pg_cron via pg_net, cf. 0014).
 * Sécurisé par un secret partagé (CRON_SECRET, comparaison à temps constant).
 * Énumère les orphelins via la RPC DEFINER (double vérif : `not exists` +
 * ancienneté), puis les supprime réellement via l'API Storage service-role
 * (un DELETE SQL sur storage.objects ne retirerait pas le fichier physique).
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return new Response("forbidden", { status: 403 });

  const admin = createAdminClient();
  if (!admin) return new Response("service unavailable", { status: 503 });

  const { data, error } = await admin.rpc("list_orphan_storage_paths");
  if (error) {
    console.error("storage cleanup: enumerate failed", error.message);
    return new Response("error", { status: 500 });
  }
  const rows = (data ?? []) as OrphanRow[];

  const byBucket = new Map<string, string[]>();
  for (const r of rows) {
    const arr = byBucket.get(r.bucket) ?? [];
    arr.push(r.path);
    byBucket.set(r.bucket, arr);
  }

  let deleted = 0;
  for (const [bucket, paths] of byBucket) {
    // Suppression par lots (payloads bornés).
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error: rmErr } = await admin.storage.from(bucket).remove(chunk);
      if (rmErr) {
        console.error(`storage cleanup: remove failed (${bucket})`, rmErr.message);
      } else {
        deleted += chunk.length;
      }
    }
  }

  await admin.from("storage_cleanup_runs").insert({ deleted_count: deleted });
  // Purge des lignes data_exports dont le fichier vient d'être nettoyé (> 24 h).
  await admin
    .from("data_exports")
    .delete()
    .lt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());

  return Response.json({ ok: true, deleted });
}
