"use client";

import { useFormStatus } from "react-dom";

/**
 * Bouton CTA — charte 04 · Boutons :
 * défaut #E02556, survol #C21D47, désactivé #F3F3F4.
 */
export function SubmitButton({
  children,
  disabled = false,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className="w-full rounded-btn bg-brand px-4 py-4 font-display text-body font-semibold text-brand-fg transition hover:bg-brand-hover disabled:bg-disabled disabled:text-ink/40"
    >
      {pending ? "Un instant…" : children}
    </button>
  );
}
