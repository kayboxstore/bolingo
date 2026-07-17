"use client";

import { useState } from "react";

/**
 * Bouton d'export RGPD. Récupère le JSON en streaming direct depuis la Route
 * Handler /api/export (la réponse HTTP EST le fichier — aucune persistance
 * Storage, aucune URL signée), puis déclenche le téléchargement via un blob
 * local. Rate-limité côté serveur (429 → message dédié).
 */
export function DataExport() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (res.status === 429) {
        setError("Un export récent existe déjà. Réessaie dans une heure.");
        return;
      }
      if (!res.ok) {
        setError("L'export a échoué. Réessaie.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bolingo-export.json";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("L'export a échoué. Réessaie.");
    } finally {
      setPending(false);
    }
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
