"use client";

import { useState, useTransition } from "react";
import { fetchMoreProfiles, submitVerdict } from "@/lib/discover/actions";
import type { DiscoveryBatch, DiscoveryCard } from "@/lib/discover/queries";
import { HeartIcon } from "@/components/brand/logo";
import { XIcon } from "@/components/brand/icons";
import { ProfileCard } from "@/components/discover/profile-card";

const REFILL_THRESHOLD = 3;

/**
 * Deck de découverte : une carte visible, actions Like/Passer, rechargement
 * progressif quand le deck s'amenuise, état vide avec renouvellement.
 */
export function DiscoverDeck({ initial }: { initial: DiscoveryBatch }) {
  const [cards, setCards] = useState<DiscoveryCard[]>(initial.cards);
  const [exhausted, setExhausted] = useState(initial.exhausted);
  const [isPending, startTransition] = useTransition();
  const [isRefilling, setIsRefilling] = useState(false);

  const current = cards[0] ?? null;

  async function refill(deck: DiscoveryCard[]) {
    if (exhausted || isRefilling) return;
    setIsRefilling(true);
    try {
      const batch = await fetchMoreProfiles(deck.map((c) => c.userId));
      setCards((prev) => {
        const known = new Set(prev.map((c) => c.userId));
        return [...prev, ...batch.cards.filter((c) => !known.has(c.userId))];
      });
      setExhausted(batch.exhausted);
    } finally {
      setIsRefilling(false);
    }
  }

  function act(verdict: "like" | "pass") {
    if (!current || isPending) return;
    const rest = cards.slice(1);
    // Avance optimiste : l'action est idempotente côté serveur.
    setCards(rest);
    startTransition(async () => {
      await submitVerdict(current.userId, verdict);
      if (rest.length <= REFILL_THRESHOLD) void refill(rest);
    });
  }

  async function renew() {
    setExhausted(false);
    setIsRefilling(true);
    try {
      const batch = await fetchMoreProfiles([]);
      setCards(batch.cards);
      setExhausted(batch.exhausted);
    } finally {
      setIsRefilling(false);
    }
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-6 rounded-card border border-ink/10 bg-white p-6 text-center shadow-sm">
        <HeartIcon className="h-12 w-12" />
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-h3 text-ink">
            Plus de profils pour l&apos;instant
          </h2>
          <p className="text-body text-ink/70">
            Reviens un peu plus tard, élargis ton rayon de recherche, ou
            relance la découverte.
          </p>
        </div>
        <button
          type="button"
          onClick={renew}
          disabled={isRefilling}
          className="w-full rounded-btn bg-brand px-4 py-4 font-display text-body font-semibold text-brand-fg transition hover:bg-brand-hover disabled:bg-disabled disabled:text-ink/40"
        >
          {isRefilling ? "Un instant…" : "Relancer la découverte"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ProfileCard card={current} />
      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => act("pass")}
          disabled={isPending}
          aria-label={`Passer ${current.displayName}`}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-ink/15 text-ink transition hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 disabled:border-ink/10 disabled:text-ink/40"
        >
          <XIcon className="h-6 w-6" />
        </button>
        {/* Cœur rose vif (territoire de l'accent) sur bouton fantôme — pas de
            recoloration du cœur, le rose CTA reste réservé aux CTA pleins. */}
        <button
          type="button"
          onClick={() => act("like")}
          disabled={isPending}
          aria-label={`Liker ${current.displayName}`}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-ink/15 transition hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 disabled:border-ink/10 disabled:opacity-40"
        >
          <HeartIcon className="h-6 w-6" />
        </button>
      </div>
      {cards.length <= REFILL_THRESHOLD && !exhausted && (
        <p className="text-center text-legend text-ink/70" aria-live="polite">
          Chargement de nouveaux profils…
        </p>
      )}
    </div>
  );
}
