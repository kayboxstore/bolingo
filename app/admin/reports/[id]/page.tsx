import { notFound } from "next/navigation";
import Link from "next/link";
import { loadReport } from "@/lib/admin/queries";
import { REPORT_CATEGORY_LABELS } from "@/lib/moderation/constants";
import {
  ACCOUNT_STATUS_LABELS,
  PENDING_STATUSES,
  REPORT_STATUS_LABELS,
} from "@/lib/admin/constants";
import { ReportActions } from "@/components/admin/report-actions";
import { AccountActions } from "@/components/admin/account-actions";
import { ArrowLeftIcon } from "@/components/brand/icons";

export default async function AdminReportDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const report = await loadReport(params.id);
  if (!report) notFound();

  const reportedActive = report.reportedStatus === "active";
  const reportedSuspended = report.reportedStatus === "suspended";
  const canSuspend = reportedActive && Boolean(report.reportedId);

  return (
    <>
      <Link
        href="/admin"
        className="-m-2 inline-flex w-fit items-center gap-2 rounded-btn p-2 text-legend text-ink/70 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Retour aux signalements
      </Link>

      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h2 text-ink">
          {REPORT_CATEGORY_LABELS[report.category]}
        </h1>
        <span className="shrink-0 rounded-btn bg-disabled px-3 py-1 text-legend text-ink/70">
          {REPORT_STATUS_LABELS[report.status]}
        </span>
      </div>

      <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 rounded-card border border-ink/10 bg-white p-6 text-body shadow-sm">
        <dt className="text-legend text-ink/60">Signalé par</dt>
        <dd className="text-ink">{report.reporterHandle ?? "compte indisponible"}</dd>

        <dt className="text-legend text-ink/60">Compte signalé</dt>
        <dd className="text-ink">
          {report.reportedHandle ?? "compte indisponible"}
          {report.reportedStatus && (
            <span className="ml-2 text-legend text-ink/60">
              ({ACCOUNT_STATUS_LABELS[report.reportedStatus]})
            </span>
          )}
        </dd>

        <dt className="text-legend text-ink/60">Reçu le</dt>
        <dd className="text-ink">
          <time dateTime={report.createdAt}>
            {new Date(report.createdAt).toLocaleString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </dd>
      </dl>

      {report.details && (
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-h3 text-ink">Détails du signalement</h2>
          <p className="whitespace-pre-wrap rounded-card border border-ink/10 bg-white p-6 text-body text-ink/80 shadow-sm">
            {report.details}
          </p>
        </div>
      )}

      {report.messageId && (
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-h3 text-ink">
            Message joint comme preuve
          </h2>
          <p className="text-legend text-ink/60">
            Capturé au moment du signalement (reste lisible même si le message a
            été supprimé depuis).
          </p>
          <blockquote className="whitespace-pre-wrap rounded-card border border-ink/10 bg-disabled p-6 text-body italic text-ink/80">
            {report.evidenceContent
              ? `« ${report.evidenceContent} »`
              : "Contenu indisponible."}
          </blockquote>
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-ink/10 pt-6">
        <h2 className="font-display text-h3 text-ink">Action</h2>
        <ReportActions
          reportId={report.id}
          canSuspend={canSuspend}
          alreadyHandled={!PENDING_STATUSES.includes(report.status)}
        />
        {reportedSuspended && report.reportedId && (
          <div className="flex items-center justify-between gap-4 rounded-card border border-ink/10 bg-white p-6 shadow-sm">
            <p className="text-body text-ink/80">
              Ce compte est actuellement suspendu.
            </p>
            <AccountActions userId={report.reportedId} suspended />
          </div>
        )}
      </div>
    </>
  );
}
