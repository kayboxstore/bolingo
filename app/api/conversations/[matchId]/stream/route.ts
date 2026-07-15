import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/messages/types";

// Abonnement Realtime long-vécu + poll → runtime Node, jamais mis en cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECONCILE_MS = 4000;
const HEARTBEAT_MS = 25000;

/**
 * Proxy SSE : le SERVEUR tient l'abonnement Supabase Realtime (authentifié par
 * la session httpOnly — le JWT ne quitte jamais le serveur) et relaie les
 * nouveaux messages au navigateur. Un poll keyset de réconciliation (4 s)
 * garantit la livraison même si le WebSocket Realtime n'est pas disponible
 * dans le runtime, et détecte l'unmatch/blocage pour couper la conversation.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { matchId: string } },
) {
  const matchId = params.matchId;
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

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
  let lastAt = new Date(0).toISOString();
  let lastId = "00000000-0000-0000-0000-000000000000";
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const comment = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: ping\n\n`));
      };

      const pushMessage = (m: {
        id: string;
        sender_id: string;
        content: string;
        deleted_at: string | null;
        created_at: string;
      }) => {
        const message: ChatMessage = {
          id: m.id,
          senderId: m.sender_id,
          content: m.deleted_at ? "" : m.content,
          deletedAt: m.deleted_at,
          createdAt: m.created_at,
        };
        if (m.deleted_at) {
          // un soft-delete doit toujours passer, même déjà « vu »
          send({ type: "message", message });
          return;
        }
        if (sentIds.has(m.id)) return;
        sentIds.add(m.id);
        if (
          m.created_at > lastAt ||
          (m.created_at === lastAt && m.id > lastId)
        ) {
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
            const row = (payload.new ?? {}) as Record<string, unknown>;
            if (row.id) pushMessage(row as never);
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
        // La conversation est-elle toujours accessible ? (RLS : renvoie 0
        // ligne si unmatch/blocage → on coupe proprement des deux côtés.)
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

        const { data: rows } = await supabase
          .from("messages")
          .select("id, sender_id, content, deleted_at, created_at")
          .eq("match_id", matchId)
          .or(
            `created_at.gt.${lastAt},and(created_at.eq.${lastAt},id.gt.${lastId})`,
          )
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(100);
        rows?.forEach((r) => pushMessage(r as never));

        const { data: readAt } = await supabase.rpc("other_last_read", {
          p_match_id: matchId,
        });
        send({ type: "read", at: (readAt as string | null) ?? null });
      };

      const reconcileTimer = setInterval(() => void reconcile(), RECONCILE_MS);
      const heartbeatTimer = setInterval(comment, HEARTBEAT_MS);

      const cleanup = () => {
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
      };

      request.signal.addEventListener("abort", cleanup);

      send({ type: "ready" });
      await reconcile(); // rattrapage initial immédiat
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
