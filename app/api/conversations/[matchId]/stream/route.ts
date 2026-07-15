import { type NextRequest } from "next/server";
import { getActiveMemberOrNull } from "@/lib/auth/guards";
import type { ChatMessage } from "@/lib/messages/types";

// Abonnement Realtime long-vécu + poll → runtime Node, jamais mis en cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECONCILE_MS = 4000;
const HEARTBEAT_MS = 25000;

type MessageRow = {
  id: string;
  sender_id: string;
  content: string;
  deleted_at: string | null;
  created_at: string;
};

const ZERO_TS = new Date(0).toISOString();
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Proxy SSE : le SERVEUR tient l'abonnement Supabase Realtime (authentifié par
 * la session httpOnly — le JWT ne quitte jamais le serveur) et relaie les
 * messages au navigateur. Un poll de réconciliation (4 s) garantit la
 * livraison même si le WebSocket Realtime est indisponible, relaie aussi les
 * soft-deletes (curseur dédié), et détecte l'unmatch/blocage pour couper la
 * conversation. Réservé aux membres actifs (statut/onboarding vérifiés).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { matchId: string } },
) {
  const matchId = params.matchId;

  // Même garantie que requireActiveMember (statut actif, non flagué, onboarding
  // complet) — sinon un compte suspendu garderait l'accès au flux.
  const member = await getActiveMemberOrNull();
  if (!member) return new Response("forbidden", { status: 403 });
  const { supabase } = member;

  // Participant d'un match actif ? La RLS matches filtre déjà (pas d'oracle).
  const { data: match } = await supabase
    .from("matches")
    .select("id")
    .eq("id", matchId)
    .eq("status", "active")
    .maybeSingle();
  if (!match) return new Response("not found", { status: 404 });

  // Authentifie le socket Realtime avec le token de session (côté serveur).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) supabase.realtime.setAuth(session.access_token);

  const encoder = new TextEncoder();
  const sentIds = new Set<string>();
  const deletedSent = new Set<string>();
  // Amorçage optionnel du curseur depuis le dernier message connu du client
  // (évite de re-tout-rejouer à chaque reconnexion EventSource). (audit ⚠️)
  const sinceAt = request.nextUrl.searchParams.get("sinceAt");
  const sinceId = request.nextUrl.searchParams.get("sinceId");
  let lastAt = sinceAt ?? ZERO_TS;
  let lastId = sinceId ?? ZERO_UUID;
  let lastDeleteAt = ZERO_TS;
  let closed = false;
  let cleanupFn: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup(); // controller déjà fermé → on nettoie
        }
      };
      const send = (event: unknown) =>
        enqueue(`data: ${JSON.stringify(event)}\n\n`);
      const comment = () => enqueue(`: ping\n\n`);

      const pushMessage = (m: MessageRow) => {
        const message: ChatMessage = {
          id: m.id,
          senderId: m.sender_id,
          content: m.deleted_at ? "" : m.content,
          deletedAt: m.deleted_at,
          createdAt: m.created_at,
        };
        if (m.deleted_at) {
          // Un soft-delete doit toujours passer (même si l'id a déjà été
          // envoyé comme message vivant), mais une seule fois.
          if (deletedSent.has(m.id)) return;
          deletedSent.add(m.id);
          if (m.deleted_at > lastDeleteAt) lastDeleteAt = m.deleted_at;
          send({ type: "message", message });
          return;
        }
        if (sentIds.has(m.id)) return;
        sentIds.add(m.id);
        if (m.created_at > lastAt || (m.created_at === lastAt && m.id > lastId)) {
          lastAt = m.created_at;
          lastId = m.id;
        }
        send({ type: "message", message });
      };

      // ---- Realtime (best-effort : le poll est le filet de sécurité) --------
      const channel = supabase
        .channel(`conv:${matchId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `match_id=eq.${matchId}`,
          },
          (payload) => {
            const row = payload.new as Partial<MessageRow> | null;
            if (row?.id) pushMessage(row as MessageRow);
          },
        );
      try {
        channel.subscribe();
      } catch {
        // WS indisponible : on se repose entièrement sur le poll.
      }

      // ---- Réconciliation + détection d'unmatch/blocage ---------------------
      const reconcile = async () => {
        if (closed) return;
        // Conversation toujours accessible ? (RLS matches : 0 ligne si
        // unmatch/blocage/compte suspendu → on coupe des deux côtés.)
        const { data: still } = await supabase
          .from("matches")
          .select("id")
          .eq("id", matchId)
          .eq("status", "active")
          .maybeSingle();
        if (!still) {
          send({ type: "closed" });
          cleanup();
          return;
        }

        // (a) nouveaux messages (curseur d'insertion)
        const { data: rows } = await supabase
          .from("messages")
          .select("id, sender_id, content, deleted_at, created_at")
          .eq("match_id", matchId)
          .or(
            `created_at.gt.${lastAt},and(created_at.eq.${lastAt},id.gt.${lastId})`,
          )
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(100);
        (rows as MessageRow[] | null)?.forEach(pushMessage);

        // (b) suppressions (curseur de suppression dédié — sinon un soft-delete
        // d'un message antérieur au curseur d'insertion n'est jamais relayé
        // quand le WS Realtime est indisponible). (audit code 🔴)
        const { data: deletes } = await supabase
          .from("messages")
          .select("id, sender_id, content, deleted_at, created_at")
          .eq("match_id", matchId)
          .not("deleted_at", "is", null)
          .gt("deleted_at", lastDeleteAt)
          .order("deleted_at", { ascending: true })
          .limit(100);
        (deletes as MessageRow[] | null)?.forEach(pushMessage);

        const { data: readAt } = await supabase.rpc("other_last_read", {
          p_match_id: matchId,
        });
        send({ type: "read", at: (readAt as string | null) ?? null });
      };

      const reconcileTimer = setInterval(() => void reconcile(), RECONCILE_MS);
      const heartbeatTimer = setInterval(comment, HEARTBEAT_MS);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(reconcileTimer);
        clearInterval(heartbeatTimer);
        void supabase.removeChannel(channel);
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      }
      cleanupFn = cleanup; // exposé au cancel() du stream
      request.signal.addEventListener("abort", cleanup);

      send({ type: "ready" });
      await reconcile(); // rattrapage initial immédiat
    },
    cancel() {
      cleanupFn?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
