"use client";

/* eslint-disable @next/next/no-img-element -- URLs signées éphémères, hors next/image */

import { useState, useTransition } from "react";
import { unblockUser } from "@/lib/moderation/actions";
import type { BlockedUser } from "@/lib/moderation/queries";

/**
 * Liste des comptes bloqués avec déblocage. Retrait optimiste ; un échec
 * réintègre la ligne et affiche une erreur.
 */
export function BlockedList({ initial }: { initial: BlockedUser[] }) {
  const [items, setItems] = useState<BlockedUser[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onUnblock(target: BlockedUser) {
    setError(null);
    setPendingId(target.userId);
    startTransition(async () => {
      const res = await unblockUser(target.userId).catch(() => ({
        ok: false,
      }));
      setPendingId(null);
      if (res.ok) {
        setItems((prev) => prev.filter((b) => b.userId !== target.userId));
      } else {
        setError("Le déblocage a échoué. Réessaie.");
      }
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-card border border-ink/10 bg-white p-6 text-center text-body text-ink/70 shadow-sm">
        Tu n&apos;as bloqué personne.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-legend text-error">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-4">
        {items.map((b) => (
          <li
            key={b.userId}
            className="flex items-center gap-4 rounded-card border border-ink/10 bg-white p-6 shadow-sm"
          >
            {b.photoUrl ? (
              <img
                src={b.photoUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-card object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-disabled text-legend text-ink/60">
                —
              </div>
            )}
            <span className="min-w-0 flex-1 truncate font-display text-body font-semibold text-ink">
              {b.displayName ?? "Profil indisponible"}
            </span>
            <button
              type="button"
              onClick={() => onUnblock(b)}
              disabled={pendingId === b.userId}
              aria-label={`Débloquer ${b.displayName ?? "cette personne"}`}
              className="shrink-0 rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {pendingId === b.userId ? "…" : "Débloquer"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
