"use client";

import { useEffect, useState, useTransition } from "react";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  currentPushEndpoint,
  PUSH_PUBLIC_KEY,
} from "@/lib/push/client";
import {
  savePushSubscription,
  deletePushSubscription,
} from "@/lib/push/actions";

type Status = "loading" | "unsupported" | "denied" | "enabled" | "disabled";

const btnClass =
  "w-fit rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/**
 * Réglage Web Push. Permission demandée UNIQUEMENT sur action explicite (jamais
 * de prompt auto). Désactiver = désinscrire cet appareil (les autres continuent
 * de recevoir). Un refus navigateur affiche un état clair sans re-demander.
 */
export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isPushSupported() || !PUSH_PUBLIC_KEY) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const endpoint = await currentPushEndpoint();
      if (!cancelled) setStatus(endpoint ? "enabled" : "disabled");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function enable() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const keys = await subscribeToPush();
        if (!keys) {
          // Permission refusée ou abonnement impossible.
          setStatus(Notification.permission === "denied" ? "denied" : "disabled");
          if (Notification.permission !== "denied") {
            setError("Activation impossible. Réessaie.");
          }
          return;
        }
        const res = await savePushSubscription({
          ...keys,
          userAgent: navigator.userAgent,
        });
        if (res.ok) {
          setStatus("enabled");
        } else {
          // Rollback navigateur : sans ligne serveur, un abonnement navigateur
          // laissé actif afficherait « activé » sans jamais rien recevoir.
          await unsubscribeFromPush().catch(() => null);
          setStatus("disabled");
          setError("Enregistrement impossible. Réessaie.");
        }
      } catch {
        setError("Activation impossible. Réessaie.");
      }
    });
  }

  function disable() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        // Serveur d'abord : si la suppression échoue, on reste « activé » (pas
        // de désync). L'abonnement navigateur n'est retiré qu'ensuite.
        const endpoint = await currentPushEndpoint();
        if (endpoint) {
          const res = await deletePushSubscription(endpoint);
          if (!res.ok) {
            setError("Désactivation impossible. Réessaie.");
            return;
          }
        }
        await unsubscribeFromPush();
        setStatus("disabled");
      } catch {
        setError("Désactivation impossible. Réessaie.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-legend text-ink/70">
        Reçois une notification sur cet appareil pour un nouveau match ou un
        nouveau message, même quand l&apos;onglet est fermé. Aucun contenu de
        message n&apos;est inclus dans la notification.
      </p>

      {status === "loading" && (
        <p className="text-legend text-ink/60" aria-live="polite">
          Vérification…
        </p>
      )}

      {status === "unsupported" && (
        <p className="text-legend text-ink/60">
          Ton navigateur ne prend pas en charge les notifications push.
        </p>
      )}

      {status === "denied" && (
        <p className="text-legend text-ink/70">
          Les notifications sont bloquées pour ce site. Autorise-les dans les
          réglages de ton navigateur pour les activer.
        </p>
      )}

      {status === "disabled" && (
        <button type="button" onClick={enable} disabled={pending} className={btnClass}>
          {pending ? "Activation…" : "Activer les notifications push"}
        </button>
      )}

      {status === "enabled" && (
        <div className="flex flex-col gap-2">
          <p className="text-legend text-ink">Activées sur cet appareil.</p>
          <button type="button" onClick={disable} disabled={pending} className={btnClass}>
            {pending ? "Désactivation…" : "Désactiver sur cet appareil"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-legend text-error">
          {error}
        </p>
      )}
    </div>
  );
}
