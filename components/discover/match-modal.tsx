"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { HeartIcon } from "@/components/brand/logo";

/**
 * Notification in-app de nouveau match. `<dialog>.showModal()` fournit
 * gratuitement le focus trap, la fermeture par Échap et l'inertie du fond
 * (WCAG 2.4.3 / 2.4.7). Le scroll du body est verrouillé le temps de l'ouverture.
 */
export function MatchModal({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      aria-labelledby="match-title"
      className="w-full max-w-sm rounded-card bg-white p-6 shadow-sm backdrop:bg-ink/60"
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <HeartIcon className="h-12 w-12 text-accent" />
        <div className="flex flex-col gap-2">
          <h2 id="match-title" className="font-display text-h3 text-ink">
            C&apos;est un match !
          </h2>
          <p className="text-body text-ink/70">
            Toi et {name}, vous vous êtes plu.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Link
            href="/matches"
            className="w-full rounded-btn bg-brand px-4 py-4 text-center font-display text-body font-semibold text-brand-fg transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Voir mes matches
          </Link>
          <button
            type="button"
            autoFocus
            onClick={() => ref.current?.close()}
            className="w-full rounded-btn border border-ink/15 px-4 py-4 font-display text-body font-semibold text-ink transition hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Continuer à explorer
          </button>
        </div>
      </div>
    </dialog>
  );
}
