"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveReport } from "@/lib/admin/actions";
import type { ReportAction } from "@/lib/admin/constants";

/**
 * Actions sur un signalement. « Suspendre » (irréversible côté effet immédiat,
 * safety-critical) demande une confirmation en deux temps + style destructif ;
 * rejeter / avertir sont des actions simples. router.refresh() resynchronise
 * les données serveur après chaque action (statut du report / du compte).
 */
export function ReportActions({
  reportId,
  canSuspend,
  alreadyHandled = false,
}: {
  reportId: string;
  canSuspend: boolean;
  /** Le signalement est déjà traité/rejeté : les actions restent possibles
   *  (idempotent) mais on le signale pour lever l'ambiguïté. */
  alreadyHandled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);

  function run(action: ReportAction) {
    setError(null);
    startTransition(async () => {
      const res = await resolveReport({ reportId, action }).catch(() => ({
        ok: false,
      }));
      if (res.ok) {
        setConfirmingSuspend(false);
        router.refresh();
      } else {
        setError("L'action a échoué. Réessaie.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {alreadyHandled && (
        <p className="text-legend text-ink/70">
          Ce signalement est déjà traité — une nouvelle action met simplement son
          statut à jour.
        </p>
      )}
      {error && (
        <p role="alert" className="text-legend text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("dismiss")}
          disabled={pending}
          className="rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Rejeter
        </button>
        <button
          type="button"
          onClick={() => run("warn")}
          disabled={pending}
          className="rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Avertir (traiter sans suite)
        </button>
        {canSuspend &&
          (confirmingSuspend ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => run("suspend")}
                disabled={pending}
                className="rounded-btn bg-error px-4 py-2 font-display text-legend font-semibold text-white transition hover:bg-error-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                {pending ? "Un instant…" : "Confirmer la suspension"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingSuspend(false)}
                disabled={pending}
                className="rounded-btn px-4 py-2 font-display text-legend font-semibold text-ink/70 transition hover:text-ink disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingSuspend(true)}
              disabled={pending}
              className="rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 hover:text-ink disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Suspendre le compte signalé
            </button>
          ))}
      </div>
    </div>
  );
}
