import { Logo } from "@/components/brand/logo";
import { signOut } from "@/lib/auth/actions";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
        <Logo />
        <form action={signOut}>
          <button
            type="submit"
            className="text-legend font-medium text-ink/60 underline-offset-2 hover:underline"
          >
            Se déconnecter
          </button>
        </form>
      </header>
      <main className="flex flex-1 flex-col px-6 py-8">{children}</main>
    </div>
  );
}
