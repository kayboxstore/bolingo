"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellIcon } from "@/components/brand/icons";

/**
 * Cloche de notifications : compteur non-lu en direct via le proxy SSE
 * (/api/notifications/stream). `initialUnread` est rendu côté serveur pour
 * éviter le flash au montage ; l'EventSource prend le relais.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    let stopped = false;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (stopped) return;
      es = new EventSource("/api/notifications/stream");
      es.onmessage = (e) => {
        let evt: { type: "ready" } | { type: "count"; unread: number };
        try {
          evt = JSON.parse(e.data);
        } catch {
          return; // payload malformé : on ignore
        }
        if (evt.type === "count") setUnread(evt.unread);
      };
      es.onerror = () => {
        // Un EventSource ne se reconnecte pas après un échec initial (403/5xx) :
        // on ferme et on retente (backoff fixe).
        if (es?.readyState === EventSource.CLOSED && !stopped) {
          es.close();
          retry = setTimeout(connect, 5000);
        }
      };
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      es?.close();
    };
  }, []);

  const label =
    unread > 0
      ? `Notifications (${unread} non lue${unread > 1 ? "s" : ""})`
      : "Notifications";

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative -m-2 rounded-btn p-2 text-ink/70 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <BellIcon className="h-6 w-6" />
      {unread > 0 && (
        // Badge TEXTE → bg-brand text-brand-fg (AA 4.6:1) ; le rose vif (accent)
        // échoue AA sous du texte (réservé aux points sans chiffre).
        <span
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-legend font-semibold text-brand-fg"
          aria-hidden="true"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
