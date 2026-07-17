import { type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayloadSub = { endpoint: string; p256dh: string; auth: string };
type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  subscriptions: PayloadSub[];
};

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Configure les clés VAPID une fois si l'environnement est complet. */
function configureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:notifications@bolingo.app";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/**
 * Envoi Web Push, déclenché par pg_net (trigger sur notifications, cf. 0016).
 * Sécurisé par un secret partagé (CRON_SECRET, comparaison à temps constant).
 * Assemble le payload MINIMAL via la RPC DEFINER get_push_payload (re-applique
 * le filtre de visibilité ; JAMAIS de contenu de message), puis pousse sur
 * chaque abonnement du destinataire. 404/410 → l'abonnement est mort : on le
 * supprime en base (pas de relance infinie).
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return new Response("forbidden", { status: 403 });

  if (!configureVapid()) {
    console.error("web push: clés VAPID absentes");
    return new Response("push not configured", { status: 500 });
  }

  const admin = createAdminClient();
  if (!admin) return new Response("service unavailable", { status: 503 });

  let notificationId: string | null = null;
  try {
    const body = (await request.json()) as { notification_id?: string };
    notificationId = body.notification_id ?? null;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (!notificationId) return new Response("bad request", { status: 400 });

  const { data, error } = await admin.rpc("get_push_payload", {
    p_notification_id: notificationId,
  });
  if (error) {
    console.error("web push: get_push_payload failed", error.message);
    return new Response("error", { status: 500 });
  }
  // Rien à envoyer (notif supprimée/filtrée, ou aucun appareil abonné).
  if (!data) return new Response(null, { status: 204 });

  const payload = data as PushPayload;
  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  });

  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    payload.subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          dead.push(sub.endpoint); // abonnement expiré/invalide
        } else {
          console.error("web push: send failed", status ?? e);
        }
      }
    }),
  );

  if (dead.length > 0) {
    const { error: delErr } = await admin
      .from("push_subscriptions")
      .delete()
      .in("endpoint", dead);
    if (delErr) console.error("web push: cleanup failed", delErr.message);
  }

  return Response.json({ sent, removed: dead.length }, { status: 200 });
}
