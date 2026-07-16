"use client";

/* eslint-disable @next/next/no-img-element -- URLs signées éphémères, hors next/image */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  fetchMoreNotifications,
  markAllNotificationsRead,
  openNotification,
} from "@/lib/notifications/actions";
import type { NotificationItem } from "@/lib/notifications/queries";
import { HeartIcon } from "@/components/brand/logo";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
}

function label(n: NotificationItem): string {
  const who = n.actorName ?? "Quelqu'un";
  return n.type === "new_match"
    ? `Nouveau match avec ${who}`
    : `${who} t'a envoyé un message`;
}

export function NotificationList({
  initial,
  initialHasMore,
}: {
  initial: NotificationItem[];
  initialHasMore: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [, startTransition] = useTransition();

  // À l'ouverture : tout marquer lu (serveur) + refléter localement. Le badge de
  // l'en-tête se met à jour via son flux SSE.
  useEffect(() => {
    void markAllNotificationsRead();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  function onOpen(n: NotificationItem) {
    startTransition(async () => {
      const res = await openNotification(n.id).catch(() => ({
        ok: false,
        target: "/notifications",
      }));
      router.push(res.target);
    });
  }

  async function onLoadMore() {
    const last = items[items.length - 1];
    if (loadingMore || !last) return;
    setLoadingMore(true);
    try {
      const more = await fetchMoreNotifications({
        createdAt: last.createdAt,
        id: last.id,
      });
      setItems((prev) => [...prev, ...more.items]);
      setHasMore(more.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onOpen(n)}
              className={`flex w-full items-center gap-4 rounded-card border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                n.read
                  ? "border-ink/10 bg-white hover:border-ink/30"
                  : "border-brand/20 bg-brand/5 hover:border-brand/40"
              }`}
            >
              {n.actorPhotoUrl ? (
                <img
                  src={n.actorPhotoUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-card object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-disabled text-ink/60">
                  <HeartIcon className="h-6 w-6 text-accent" />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="truncate font-display text-body font-semibold text-ink">
                  {label(n)}
                </span>
                <time
                  dateTime={n.createdAt}
                  suppressHydrationWarning
                  className="text-legend text-ink/60"
                >
                  {relativeTime(n.createdAt)}
                </time>
              </div>
              {!n.read && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-accent"
                  aria-label="Non lue"
                />
              )}
            </button>
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {loadingMore ? "Chargement…" : "Afficher plus"}
          </button>
        </div>
      )}
    </div>
  );
}
