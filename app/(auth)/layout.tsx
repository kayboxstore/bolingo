import { Logo } from "@/components/brand/logo";

/** Layout des écrans d'auth : logo + carte centrée (padding 24, grille 8 px). */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-6 py-12">
      <Logo />
      <div className="w-full max-w-md rounded-card border border-ink/10 bg-white p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}
