import { type NextRequest } from "next/server";
import { getActiveMemberOrNull } from "@/lib/auth/guards";

// Abonnement Realtime long-vécu + poll → runtime Node, jamais mis en cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECONCILE_MS = 5000;
const HEARTBEAT_MS = 25000;

/**
 * Proxy SSE du compteur de notifications non lues. Le SERVEUR tient l'abonnement
 * Supabase Realtime (authentifié par la session httpOnly — le JWT ne quitte
 * jamais le serveur) filtré sur les notifications du destinataire, et relaie le
 * compteur au navigateur. Un poll de réconciliation (5 s) garantit la livraison
 * même si le WebSocket est indisponible. Réservé aux membres actifs.
 */
export async function GET(request: NextRequest) {
  const member = await getActiveMemberOrNull();
  if (!member) return new Response("forbidden", { status: 403 });
  const { supabase, user } = member;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) supabase.realtime.setAuth(session.access_token);

  const encoder = new TextEncoder();
  let closed = false;
  let lastCount = -1;
  let cleanupFn: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: unknown) =>
        enqueue(`data: ${JSON.stringify(event)}\n\n`);
      const comment = () => enqueue(`: ping\n\n`);

      const pushCount = async () => {
        if (closed) return;
        const { data } = await supabase.rpc("unread_notifications_count");
        const n = typeof data === "number" ? data : 0;
        if (n !== lastCount) {
          lastCount = n;
          send({ type: "count", unread: n });
        }
      };

      const channel = supabase
        .channel(`notif:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          () => void pushCount(),
        );
      try {
        channel.subscribe();
      } catch {
        // WS indisponible : on se repose sur le poll.
      }

      const reconcileTimer = setInterval(() => void pushCount(), RECONCILE_MS);
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
      cleanupFn = cleanup;
      request.signal.addEventListener("abort", cleanup);

      send({ type: "ready" });
      await pushCount();
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
