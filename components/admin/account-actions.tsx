"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAccountStatus } from "@/lib/admin/actions";

/**
 * Réactiver ou suspendre un compte. Réactiver est une action simple ; suspendre
 * (safety-critical, coupe l'accès immédiatement) passe par une confirmation en
 * deux temps + CTA destructif — même règle que la suspension via un signalement.
 */
export function AccountActions({
  userId,
  suspended,
}: {
  userId: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function apply(suspend: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await setAccountStatus({ userId, suspend }).catch(() => ({
        ok: false,
      }));
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setError("L'action a échoué. Réessaie.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {suspended ? (
        <button
          type="button"
          onClick={() => apply(false)}
          disabled={pending}
          className="rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {pending ? "Un instant…" : "Réactiver"}
        </button>
      ) : confirming ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => apply(true)}
            disabled={pending}
            className="rounded-btn bg-error px-4 py-2 font-display text-legend font-semibold text-white transition hover:bg-error-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {pending ? "Un instant…" : "Confirmer la suspension"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-btn px-4 py-2 font-display text-legend font-semibold text-ink/70 transition hover:text-ink disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Annuler
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          className="rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Suspendre
        </button>
      )}
      {error && (
        <p role="alert" className="text-legend text-error">
          {error}
        </p>
      )}
    </div>
  );
}
