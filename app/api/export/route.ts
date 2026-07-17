import { getActiveMemberOrNull } from "@/lib/auth/guards";

// Streaming direct du JSON d'export — jamais écrit sur Storage.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export RGPD (portabilité) — téléchargement direct, AUCUNE persistance.
 * Garde membre actif (statut/onboarding/email + caller_active côté RPC).
 * export_my_data() applique le rate-limit atomique (1/heure) ; rien n'est écrit
 * dans Storage, aucune URL signée générée : la réponse HTTP EST le fichier.
 */
export async function GET() {
  const member = await getActiveMemberOrNull();
  if (!member) return new Response("forbidden", { status: 403 });
  const { supabase } = member;

  const { data, error } = await supabase.rpc("export_my_data");
  if (error) {
    const rateLimited = (error.message ?? "")
      .toLowerCase()
      .includes("rate limited");
    if (rateLimited) {
      return Response.json(
        { error: "Un export récent existe déjà. Réessaie dans une heure." },
        { status: 429 },
      );
    }
    console.error("export_my_data failed", error.message);
    return new Response("error", { status: 500 });
  }

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bolingo-export.json"',
      // PII : jamais mis en cache (navigateur / CDN / proxy).
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
