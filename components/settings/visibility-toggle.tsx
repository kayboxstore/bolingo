"use client";

import { useId, useState, useTransition } from "react";
import { setVisibility } from "@/lib/settings/actions";

/**
 * Interrupteur de visibilité du profil dans la découverte. `role="switch"`
 * natif (aria-checked) ; bascule optimiste avec rollback si l'action échoue.
 */
export function VisibilityToggle({
  initialVisible,
}: {
  initialVisible: boolean;
}) {
  const [visible, setVisible] = useState(initialVisible);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const labelId = useId();
  const descId = useId();

  function toggle() {
    const next = !visible;
    setVisible(next); // optimiste
    setError(null);
    startTransition(async () => {
      const res = await setVisibility(next).catch(() => ({ ok: false }));
      if (!res.ok) {
        setVisible(!next); // rollback
        setError("La modification a échoué. Réessaie.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span id={labelId} className="text-body text-ink">
            Profil visible dans la découverte
          </span>
          <span id={descId} className="text-legend text-ink/70">
            Désactivé, ton profil n&apos;apparaît plus à de nouvelles personnes.
            Tes matches et conversations restent inchangés.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={visible}
          aria-labelledby={labelId}
          aria-describedby={descId}
          onClick={toggle}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
            visible ? "bg-brand" : "bg-disabled"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
              visible ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {error && (
        <p role="alert" className="text-legend text-error">
          {error}
        </p>
      )}
    </div>
  );
}
