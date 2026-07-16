import Link from "next/link";
import { loadReports } from "@/lib/admin/queries";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  type ReportCategory,
} from "@/lib/moderation/constants";
import {
  PENDING_STATUSES,
  REPORT_STATUS_LABELS,
  type ReportStatus,
} from "@/lib/admin/constants";

type Bucket = "pending" | "resolved" | "dismissed" | "all";

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "pending", label: "En attente" },
  { key: "resolved", label: "Traités" },
  { key: "dismissed", label: "Rejetés" },
  { key: "all", label: "Tous" },
];

function isPending(status: ReportStatus): boolean {
  return PENDING_STATUSES.includes(status);
}

function inBucket(status: ReportStatus, bucket: Bucket): boolean {
  if (bucket === "all") return true;
  if (bucket === "pending") return isPending(status);
  return status === bucket;
}

function chipClass(active: boolean): string {
  return `rounded-btn px-3 py-1.5 font-display text-legend font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
    active
      ? "bg-brand text-brand-fg"
      : "border border-ink/15 text-ink/70 hover:border-ink/40 hover:text-ink"
  }`;
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: { bucket?: string; category?: string };
}) {
  const bucket: Bucket = (
    ["pending", "resolved", "dismissed", "all"] as const
  ).includes(searchParams.bucket as Bucket)
    ? (searchParams.bucket as Bucket)
    : "pending";
  const category = (REPORT_CATEGORIES as readonly string[]).includes(
    searchParams.category ?? "",
  )
    ? (searchParams.category as ReportCategory)
    : undefined;

  // Une seule lecture de toute la file : le compteur « en attente » est un vrai
  // total global (indépendant des deux filtres), et les filtres statut/catégorie
  // sont appliqués en mémoire pour la liste affichée.
  const all = await loadReports();
  const pendingCount = all.filter((r) => isPending(r.status)).length;
  const reports = all.filter(
    (r) =>
      (!category || r.category === category) && inBucket(r.status, bucket),
  );

  const buildHref = (next: { bucket?: Bucket; category?: string }) => {
    const params = new URLSearchParams();
    const b = next.bucket ?? bucket;
    const c = "category" in next ? next.category : category;
    if (b !== "pending") params.set("bucket", b);
    if (c) params.set("category", c);
    const qs = params.toString();
    return qs ? `/admin?${qs}` : "/admin";
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h2 text-ink">Signalements</h1>
        <p className="text-legend text-ink/70" aria-live="polite">
          {pendingCount} en attente de traitement
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
          {BUCKETS.map((b) => (
            <Link
              key={b.key}
              href={buildHref({ bucket: b.key })}
              className={chipClass(b.key === bucket)}
              aria-current={b.key === bucket ? "true" : undefined}
            >
              {b.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
          <Link
            href={buildHref({ category: undefined })}
            className={chipClass(!category)}
            aria-current={!category ? "true" : undefined}
          >
            Toutes catégories
          </Link>
          {REPORT_CATEGORIES.map((c) => (
            <Link
              key={c}
              href={buildHref({ category: c })}
              className={chipClass(c === category)}
              aria-current={c === category ? "true" : undefined}
            >
              {REPORT_CATEGORY_LABELS[c]}
            </Link>
          ))}
        </div>
      </div>

      {reports.length === 0 ? (
        <p className="rounded-card border border-ink/10 bg-white p-6 text-center text-body text-ink/70 shadow-sm">
          Aucun signalement dans cette vue.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reports.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/reports/${r.id}`}
                className="flex flex-col gap-2 rounded-card border border-ink/10 bg-white p-6 shadow-sm transition hover:border-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-display text-body font-semibold text-ink">
                    {REPORT_CATEGORY_LABELS[r.category]}
                  </span>
                  <span className="shrink-0 rounded-btn bg-disabled px-2 py-1 text-legend text-ink/70">
                    {REPORT_STATUS_LABELS[r.status]}
                  </span>
                </div>
                <p className="text-legend text-ink/70">
                  Signalé : {r.reportedHandle ?? "compte indisponible"}
                  {" · "}
                  <time dateTime={r.createdAt}>
                    {new Date(r.createdAt).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
