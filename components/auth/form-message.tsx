/** Bandeaux d'état des formulaires (erreur globale / succès). */

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-btn border border-error/25 bg-error/5 px-4 py-2 text-legend text-error"
    >
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-btn border border-ink/10 bg-ink/[0.03] px-4 py-2 text-legend text-ink"
    >
      {message}
    </p>
  );
}
