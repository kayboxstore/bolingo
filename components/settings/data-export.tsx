"use client";

import { useState, useTransition } from "react";
import { requestDataExport } from "@/lib/export/actions";

/**
 * Bouton d'export RGPD. Demande la génération (server action), puis ouvre l'URL
 * signée à durée limitée → téléchargement du JSON. Rate-limité côté serveur.
 */
export function DataExport() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onExport() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await requestDataExport().catch(
        () => ({ ok: false, error: "failed" }) as const,
      );
      if (res.ok) {
        // URL signée (Content-Disposition: attachment) → téléchargement direct.
        window.location.href = res.url;
      } else {
        setError(
          res.error === "rate_limited"
            ? "Un export récent existe déjà. Réessaie dans une heure."
            : res.error === "unavailable"
              ? "Export temporairement indisponible."
              : "L'export a échoué. Réessaie.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-legend text-ink/70">
        Télécharge une copie de tes données personnelles au format JSON (profil,
        messages, matches, signalements émis).
      </p>
      <button
        type="button"
        onClick={onExport}
        disabled={pending}
        className="w-fit rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {pending ? "Préparation…" : "Télécharger mes données"}
      </button>
      {error && (
        <p role="alert" className="text-legend text-error">
          {error}
        </p>
      )}
    </div>
  );
}
