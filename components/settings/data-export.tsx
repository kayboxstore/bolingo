"use client";

import { useState, useTransition } from "react";
import { requestDataExport, type ExportResult } from "@/lib/export/actions";

type ExportError = Extract<ExportResult, { ok: false }>["error"];

function errorMessage(error: ExportError): string {
  switch (error) {
    case "rate_limited":
      return "Un export récent existe déjà. Réessaie dans une heure.";
    case "unavailable":
      return "Export temporairement indisponible.";
    case "failed":
      return "L'export a échoué. Réessaie.";
    default: {
      const _exhaustive: never = error;
      return "L'export a échoué. Réessaie.";
    }
  }
}

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
        // Téléchargement via ancre invisible (l'URL signée a Content-Disposition:
        // attachment) — évite une navigation top-level vers l'URL signée.
        const a = document.createElement("a");
        a.href = res.url;
        a.download = "bolingo-export.json";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        setError(errorMessage(res.error));
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
