"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAccount } from "@/lib/account/actions";

const CONFIRM_WORD = "SUPPRIMER";

/**
 * Zone danger : suppression définitive du compte. Confirmation explicite —
 * l'utilisateur doit retaper « SUPPRIMER » pour activer le CTA destructif
 * (jamais un bouton isolé). Modale <dialog> native (focus trap + Échap).
 */
export function DeleteAccount() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = value.trim().toUpperCase() === CONFIRM_WORD;

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClose = () => {
      setValue("");
      setError(null);
      setPending(false);
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  async function onConfirm() {
    if (!confirmed || pending) return;
    setPending(true);
    setError(null);
    const res = await deleteAccount().catch(() => ({ ok: false }));
    if (res.ok) {
      // Session déjà coupée côté serveur : on navigue vers l'écran public de
      // confirmation (replace → pas de retour arrière sur /settings).
      router.replace("/account-deleted");
    } else {
      setPending(false);
      setError("La suppression a échoué. Réessaie.");
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-ink/15 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-h3 text-ink">Supprimer mon compte</h2>
        <p className="text-legend text-ink/70">
          Suppression définitive et immédiate : profil, photos, préférences et
          conversations deviennent inaccessibles. Cette action est irréversible.
        </p>
      </div>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="w-fit rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Supprimer mon compte
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-title"
        // Empêche Échap/backdrop de fermer pendant la requête (sinon le reset à
        // la fermeture masquerait l'erreur ou surprendrait avec une redirection).
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        className="w-full max-w-sm rounded-card bg-white p-6 shadow-sm backdrop:bg-ink/60"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 id="delete-title" className="font-display text-h3 text-ink">
              Confirmer la suppression
            </h3>
            <p className="text-body text-ink/70">
              Pour confirmer, tape{" "}
              <span className="font-display font-semibold text-ink">
                {CONFIRM_WORD}
              </span>{" "}
              ci-dessous. Ton compte et tes données seront supprimés
              définitivement.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="delete-confirm" className="text-legend text-ink">
              Tape « {CONFIRM_WORD} »
            </label>
            <input
              id="delete-confirm"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              className="w-full rounded-btn border border-ink/15 bg-white px-4 py-2 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          </div>

          {error && (
            <p role="alert" className="text-legend text-error">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={!confirmed || pending}
              className="w-full rounded-btn bg-error px-4 py-4 font-display text-body font-semibold text-white transition hover:bg-error-hover disabled:bg-disabled disabled:text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {pending ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
              className="w-full rounded-btn border border-ink/15 px-4 py-4 font-display text-body font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Annuler
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
