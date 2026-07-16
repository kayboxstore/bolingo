"use client";

import { useEffect, useId, useRef, useState } from "react";
import { blockUser, submitReport } from "@/lib/moderation/actions";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  REPORT_DETAILS_MAX,
  type ReportCategory,
} from "@/lib/moderation/constants";
import { EllipsisIcon } from "@/components/brand/icons";

type Mode = "menu" | "block" | "report";

/**
 * Menu « ⋯ » bloquer / signaler, réutilisable (découverte, matches,
 * conversation, message). Une seule `<dialog>` native (focus trap + Échap +
 * inertie), le contenu change selon le mode.
 */
export function ModerationMenu({
  targetId,
  targetName,
  messageId,
  onBlocked,
  triggerText,
  triggerClassName = "flex h-10 w-10 items-center justify-center rounded-full text-ink/70 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
  triggerLabel,
  startMode = "menu",
}: {
  targetId: string;
  targetName: string | null;
  messageId?: string;
  onBlocked?: () => void;
  /** Si fourni, un déclencheur texte (« Signaler ») au lieu de l'icône ⋯. */
  triggerText?: string;
  triggerClassName?: string;
  /**
   * Nom accessible du déclencheur. Sur l'icône ⋯, défaut « Options de
   * modération » ; sur un déclencheur texte, précise le contexte (le texte
   * visible sert de nom par défaut si non fourni).
   */
  triggerLabel?: string;
  /** Ouvre directement en mode signalement (report d'un message précis). */
  startMode?: Mode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>(startMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<ReportCategory>(REPORT_CATEGORIES[0]);
  const [details, setDetails] = useState("");
  const [reported, setReported] = useState(false);
  // ids uniques : ce composant est monté plusieurs fois sur une même page
  // (un par match, un par message reçu) — des id codés en dur casseraient
  // l'unicité dont dépend aria-labelledby / htmlFor.
  const uid = useId();
  const titleId = `mod-title-${uid}`;
  const detailsId = `mod-details-${uid}`;
  const categoryName = `mod-category-${uid}`;

  const who = targetName ?? "cette personne";

  function open() {
    setMode(startMode);
    setError(null);
    setReported(false);
    setPending(false);
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClose = () => {
      setMode(startMode);
      setDetails("");
      setCategory(REPORT_CATEGORIES[0]);
      setPending(false);
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, [startMode]);

  async function onBlock() {
    setPending(true);
    setError(null);
    const res = await blockUser(targetId).catch(() => ({ ok: false }));
    setPending(false);
    if (res.ok) {
      close();
      onBlocked?.();
    } else {
      setError("Le blocage a échoué. Réessaie.");
    }
  }

  async function onReport() {
    setPending(true);
    setError(null);
    const res = await submitReport({
      reportedId: targetId,
      category,
      details: details.trim() || undefined,
      messageId,
    }).catch(() => ({ ok: false, error: "Une erreur est survenue." }));
    setPending(false);
    if (res.ok) {
      setReported(true);
    } else {
      setError(res.error ?? "Une erreur est survenue.");
    }
  }

  return (
    <>
      {triggerText ? (
        <button
          type="button"
          onClick={open}
          aria-label={triggerLabel}
          className="-my-1 px-1 py-1 underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {triggerText}
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          aria-label={triggerLabel ?? "Options de modération"}
          className={triggerClassName}
        >
          <EllipsisIcon className="h-6 w-6" />
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-card bg-white p-6 shadow-sm backdrop:bg-ink/60"
      >
        {mode === "menu" && (
          <div className="flex flex-col gap-4">
            <h2 id={titleId} className="font-display text-h3 text-ink">
              {who}
            </h2>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setMode("report")}
                className="w-full rounded-btn border border-ink/15 px-4 py-4 text-left font-display text-body font-semibold text-ink transition hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Signaler
              </button>
              <button
                type="button"
                onClick={() => setMode("block")}
                className="w-full rounded-btn border border-ink/15 px-4 py-4 text-left font-display text-body font-semibold text-ink transition hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Bloquer
              </button>
              <button
                type="button"
                autoFocus
                onClick={close}
                className="w-full rounded-btn px-4 py-4 text-center font-display text-body font-semibold text-ink/70 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {mode === "block" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 id={titleId} className="font-display text-h3 text-ink">
                Bloquer {who} ?
              </h2>
              <p className="text-body text-ink/70">
                Tu ne verras plus son profil et ta conversation avec cette
                personne deviendra inaccessible. Tu pourras débloquer depuis les
                réglages.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-legend text-error">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onBlock}
                disabled={pending}
                className="w-full rounded-btn bg-error px-4 py-4 font-display text-body font-semibold text-white transition hover:bg-error-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                {pending ? "Un instant…" : "Confirmer le blocage"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setMode("menu")}
                className="w-full rounded-btn border border-ink/15 px-4 py-4 font-display text-body font-semibold text-ink transition hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {mode === "report" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 id={titleId} className="font-display text-h3 text-ink">
                Signaler {who}
              </h2>
              {messageId && (
                <p className="text-legend text-ink/70">
                  Ce signalement joint le message sélectionné comme preuve.
                </p>
              )}
            </div>

            {reported ? (
              <>
                <p className="text-body text-ink/70">
                  Merci. Notre équipe examinera ce signalement.
                </p>
                <button
                  type="button"
                  autoFocus
                  onClick={close}
                  className="w-full rounded-btn bg-brand px-4 py-4 font-display text-body font-semibold text-brand-fg transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  Fermer
                </button>
              </>
            ) : (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-legend text-ink">Motif</legend>
                  {REPORT_CATEGORIES.map((c) => (
                    <label
                      key={c}
                      className="flex cursor-pointer items-center gap-2 rounded-btn border border-ink/15 px-4 py-2 text-body text-ink transition has-[:checked]:border-brand has-[:checked]:bg-brand/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2"
                    >
                      <input
                        type="radio"
                        name={categoryName}
                        value={c}
                        checked={category === c}
                        onChange={() => setCategory(c)}
                        className="accent-brand focus-visible:outline-none"
                      />
                      {REPORT_CATEGORY_LABELS[c]}
                    </label>
                  ))}
                </fieldset>
                <div className="flex flex-col gap-2">
                  <label htmlFor={detailsId} className="text-legend text-ink">
                    Détails <span className="text-ink/70">(facultatif)</span>
                  </label>
                  <textarea
                    id={detailsId}
                    value={details}
                    onChange={(e) => setDetails(e.target.value.slice(0, REPORT_DETAILS_MAX))}
                    rows={3}
                    className="w-full resize-none rounded-btn border border-ink/15 bg-white px-4 py-2 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
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
                    onClick={onReport}
                    disabled={pending}
                    className="w-full rounded-btn bg-brand px-4 py-4 font-display text-body font-semibold text-brand-fg transition hover:bg-brand-hover disabled:bg-disabled disabled:text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  >
                    {pending ? "Envoi…" : "Envoyer le signalement"}
                  </button>
                  <button
                    type="button"
                    onClick={() => (startMode === "report" ? close() : setMode("menu"))}
                    className="w-full rounded-btn border border-ink/15 px-4 py-4 font-display text-body font-semibold text-ink transition hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  >
                    {startMode === "report" ? "Annuler" : "Retour"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
