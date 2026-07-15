"use client";

/* eslint-disable @next/next/no-img-element -- URLs signées éphémères, hors next/image */

import { useOptimistic, useState, useTransition } from "react";
import { unmatch } from "@/lib/matches/actions";
import type { MatchItem } from "@/lib/matches/queries";
import { ModerationMenu } from "@/components/moderation/moderation-menu";

/**
 * Liste des matches. L'unmatch demande une confirmation en deux temps, puis
 * retire la carte de façon optimiste ; useOptimistic resynchronise sur la
 * prop serveur (revalidatePath) — un échec réintègre donc la carte.
 */
export function MatchList({ initial }: { initial: MatchItem[] }) {
  // Base sur la prop serveur : après revalidatePath, une prop sans le match
  // remplace l'overlay optimiste ; un échec la laisse intacte → la carte
  // réapparaît (rollback gratuit).
  const [items, removeOptimistic] = useOptimistic(
    initial,
    (current: MatchItem[], removedId: string) =>
      current.filter((m) => m.matchId !== removedId),
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onUnmatch(item: MatchItem) {
    setConfirmingId(null);
    startTransition(async () => {
      removeOptimistic(item.matchId);
      const formData = new FormData();
      formData.set("matchId", item.matchId);
      await unmatch(formData);
    });
  }

  // Après blocage : la carte disparaît (le serveur masque déjà le match via
  // blocks_between). L'overlay optimiste tient jusqu'au revalidatePath.
  function onBlocked(item: MatchItem) {
    startTransition(() => {
      removeOptimistic(item.matchId);
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-card border border-ink/10 bg-white p-6 text-center text-body text-ink/70 shadow-sm">
        Pas encore de match, continue à explorer.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li
          key={item.matchId}
          className="flex items-center gap-4 rounded-card border border-ink/10 bg-white p-6 shadow-sm"
        >
          {item.photoUrl ? (
            <img
              src={item.photoUrl}
              alt={
                item.displayName ? `Photo de ${item.displayName}` : "Photo du match"
              }
              className="h-16 w-16 shrink-0 rounded-card object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-card bg-disabled text-legend text-ink/60">
              —
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="flex items-center gap-2">
              <span className="truncate font-display text-body font-semibold text-ink">
                {item.profileAvailable ? item.displayName : "Profil indisponible"}
              </span>
              {item.isNew && (
                <span className="shrink-0 rounded-btn bg-brand px-2 py-1 text-legend text-brand-fg">
                  Nouveau
                </span>
              )}
            </p>
            <p className="text-legend text-ink/70">
              Match du{" "}
              <time dateTime={item.matchedAt}>
                {new Date(item.matchedAt).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </time>
            </p>
          </div>
          {confirmingId === item.matchId ? (
            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                onClick={() => onUnmatch(item)}
                className="rounded-btn bg-error px-4 py-2 font-display text-legend font-semibold text-white transition hover:bg-error-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Confirmer
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingId(null)}
                className="rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Annuler
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirmingId(item.matchId)}
                aria-label={`Retirer le match avec ${item.displayName ?? "cette personne"}`}
                className="rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink/70 transition hover:border-ink/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Retirer
              </button>
              <ModerationMenu
                targetId={item.otherUserId}
                targetName={item.displayName}
                onBlocked={() => onBlocked(item)}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
