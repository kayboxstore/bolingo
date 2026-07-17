// Helpers Web Push côté navigateur (aucun secret : uniquement la clé PUBLIQUE
// VAPID, exposée par conception). Importé par le composant client du réglage.

export const PUSH_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushKeys = { endpoint: string; p256dh: string; auth: string };

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Clé VAPID base64url → Uint8Array (format attendu par applicationServerKey). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

function toKeys(sub: PushSubscription): PushKeys | null {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, p256dh, auth };
}

/** Endpoint de l'abonnement courant sur cet appareil, s'il existe. */
export async function currentPushEndpoint(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

/**
 * Demande la permission (si nécessaire) puis abonne cet appareil. Renvoie les
 * clés à persister côté serveur, ou null si refusé/non abonné.
 */
export async function subscribeToPush(): Promise<PushKeys | null> {
  if (!isPushSupported() || !PUSH_PUBLIC_KEY) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const reg = await readyRegistration();
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUSH_PUBLIC_KEY) as BufferSource,
    }));

  return toKeys(sub);
}

/** Désinscrit cet appareil. Renvoie l'endpoint retiré (à supprimer en base). */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
