import { Logo } from "@/components/brand/logo";
import { signOut } from "@/lib/auth/actions";

/** En-tête applicatif commun (onboarding, découverte…). */
export function AppHeader() {
  return (
    <header className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
      <Logo />
      <form action={signOut}>
        <button
          type="submit"
          className="text-legend text-ink/70 underline-offset-2 hover:underline"
        >
          Se déconnecter
        </button>
      </form>
    </header>
  );
}
