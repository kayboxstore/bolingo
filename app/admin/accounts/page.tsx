import { loadSuspendedAccounts } from "@/lib/admin/queries";
import { AccountActions } from "@/components/admin/account-actions";

export default async function AdminAccountsPage() {
  const accounts = await loadSuspendedAccounts();

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h2 text-ink">Comptes suspendus</h1>
        <p className="text-legend text-ink/70">
          {accounts.length} compte{accounts.length > 1 ? "s" : ""} suspendu
          {accounts.length > 1 ? "s" : ""}
        </p>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-card border border-ink/10 bg-white p-6 text-center text-body text-ink/70 shadow-sm">
          Aucun compte suspendu.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {accounts.map((a) => (
            <li
              key={a.userId}
              className="flex items-center justify-between gap-4 rounded-card border border-ink/10 bg-white p-6 shadow-sm"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-display text-body font-semibold text-ink">
                  {a.displayName ?? "Profil indisponible"}
                </span>
                {a.suspendedAt && (
                  <span className="text-legend text-ink/60">
                    Suspendu le{" "}
                    <time dateTime={a.suspendedAt}>
                      {new Date(a.suspendedAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </time>
                  </span>
                )}
              </div>
              <AccountActions userId={a.userId} suspended />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
