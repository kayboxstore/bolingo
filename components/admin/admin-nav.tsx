"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Signalements" },
  { href: "/admin/accounts", label: "Comptes suspendus" },
] as const;

/** Nav admin avec aria-current sur la section active (cohérent avec les chips). */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-4" aria-label="Navigation admin">
      {LINKS.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin" || pathname.startsWith("/admin/reports")
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`-m-2 rounded-btn p-2 text-legend underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
              active ? "font-semibold text-ink" : "text-ink/70"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
