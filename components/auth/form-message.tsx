/** Bandeaux d'état des formulaires (erreur globale / succès). */

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-btn border border-brand/25 bg-brand/5 px-4 py-3 text-legend text-brand"
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
      className="rounded-btn border border-ink/10 bg-ink/[0.03] px-4 py-3 text-legend text-ink"
    >
      {message}
    </p>
  );
}
