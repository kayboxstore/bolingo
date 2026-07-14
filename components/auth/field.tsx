type FieldProps = {
  label: string;
  name: string;
  type?: "email" | "password" | "text";
  autoComplete?: string;
  hint?: string;
  errors?: string[];
  defaultValue?: string;
};

/** Champ de formulaire : label, input, aide et erreurs (légende 13/18). */
export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  hint,
  errors,
  defaultValue,
}: FieldProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const hasError = Boolean(errors?.length);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-legend text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : hint ? hintId : undefined}
        className="w-full rounded-btn border border-ink/15 bg-white px-4 py-3 text-body text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 aria-[invalid]:border-brand"
      />
      {hint && !hasError && (
        <p id={hintId} className="text-legend text-ink/50">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} className="text-legend text-brand" role="alert">
          {errors!.join(" ")}
        </p>
      )}
    </div>
  );
}
