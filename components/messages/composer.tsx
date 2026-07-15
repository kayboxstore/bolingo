"use client";

import { useRef, useState } from "react";

/** Champ de saisie avec compteur de caractères visible. */
export function Composer({
  max,
  onSend,
}: {
  max: number;
  onSend: (text: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  // aligné sur le serveur qui valide content.trim() (pas la longueur brute)
  const overLimit = trimmed.length > max;
  const canSend = trimmed.length > 0 && !overLimit;

  function submit() {
    if (!canSend) return;
    void onSend(trimmed);
    setValue("");
    textareaRef.current?.focus();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2 border-t border-ink/10 px-6 py-4"
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Écris un message…"
          aria-label="Message"
          aria-invalid={overLimit || undefined}
          className="max-h-32 flex-1 resize-none rounded-btn border border-ink/15 bg-white px-4 py-2 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 aria-[invalid]:border-error"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-btn bg-brand px-4 py-2 font-display text-body font-semibold text-brand-fg transition hover:bg-brand-hover disabled:bg-disabled disabled:text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Envoyer
        </button>
      </div>
      <p
        className={`text-right text-legend ${overLimit ? "text-error" : "text-ink/60"}`}
        aria-live="polite"
      >
        {value.length}/{max}
      </p>
    </form>
  );
}
