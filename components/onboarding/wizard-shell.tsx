import { STEP_TITLES } from "@/lib/onboarding/steps";

/**
 * Cadre commun des étapes : progression (6 étapes) + titre + carte.
 * Grille 8 px : carte p-6 (24), groupes gap-4 (16), éléments gap-2 (8).
 */
export function WizardShell({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-legend text-ink/70">
          Étape {step + 1} sur {STEP_TITLES.length} · {STEP_TITLES[step]}
        </p>
        <div className="flex gap-2" role="presentation">
          {STEP_TITLES.map((label, index) => (
            <span
              key={label}
              className={`h-2 flex-1 rounded-full ${
                index <= step ? "bg-brand" : "bg-disabled"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-6 rounded-card border border-ink/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-h3 text-ink">{title}</h1>
          {subtitle && <p className="text-legend text-ink/70">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
