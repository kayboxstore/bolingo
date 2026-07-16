import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Chrome du back-office. Le guard est posé ici (couvre tout /admin/*) ET répété
 * dans chaque page (défense en profondeur) ; les RPC re-vérifient is_admin en
 * base. Un non-admin obtient un 404 (aucune fuite de l'existence de la route).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
        <span className="font-display text-body font-semibold text-ink">
          Bolingo <span className="text-ink/40">·</span> Modération
        </span>
        <AdminNav />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
