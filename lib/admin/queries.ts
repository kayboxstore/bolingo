import { createClient } from "@/lib/supabase/server";
import type { ReportCategory } from "@/lib/moderation/constants";
import type { AccountStatus, ReportStatus } from "@/lib/admin/constants";

// Le masquage de route (404 pour non-admin) est porté une fois par le layout
// admin (requireAdmin) ; la sécurité des DONNÉES est portée en base — chaque RPC
// admin re-vérifie is_admin et renvoie une erreur (jamais de données) à un
// non-admin. Ces lectures n'ont donc pas à ré-appeler le guard (cohérent avec
// lib/discover/queries.ts et lib/matches/queries.ts).

export type AdminReport = {
  id: string;
  reporterId: string | null;
  reporterHandle: string | null;
  reportedId: string | null;
  reportedHandle: string | null;
  reportedStatus: AccountStatus | null;
  category: ReportCategory;
  details: string | null;
  evidenceContent: string | null;
  messageId: string | null;
  status: ReportStatus;
  createdAt: string;
};

type ReportRow = {
  id: string;
  reporter_id: string | null;
  reporter_handle: string | null;
  reported_id: string | null;
  reported_handle: string | null;
  reported_status: AccountStatus | null;
  category: ReportCategory;
  details: string | null;
  evidence_content: string | null;
  message_id: string | null;
  status: ReportStatus;
  created_at: string;
};

function mapReport(r: ReportRow): AdminReport {
  return {
    id: r.id,
    reporterId: r.reporter_id,
    reporterHandle: r.reporter_handle,
    reportedId: r.reported_id,
    reportedHandle: r.reported_handle,
    reportedStatus: r.reported_status,
    category: r.category,
    details: r.details,
    evidenceContent: r.evidence_content,
    messageId: r.message_id,
    status: r.status,
    createdAt: r.created_at,
  };
}

/** Toute la file des signalements (RPC DEFINER admin_list_reports, gate is_admin). */
export async function loadReports(): Promise<AdminReport[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_list_reports", {
    p_status: undefined,
    p_category: undefined,
  });
  if (error) {
    console.error("admin_list_reports failed", error.message);
    return [];
  }
  return ((data ?? []) as ReportRow[]).map(mapReport);
}

/** Détail d'un signalement, ou null si introuvable. */
export async function loadReport(id: string): Promise<AdminReport | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_get_report", { p_id: id });
  if (error) {
    console.error("admin_get_report failed", error.message);
    return null;
  }
  const rows = (data ?? []) as ReportRow[];
  return rows.length > 0 ? mapReport(rows[0]) : null;
}

export type SuspendedAccount = {
  userId: string;
  displayName: string | null;
  suspendedAt: string | null;
};

type SuspendedRow = {
  user_id: string;
  display_name: string | null;
  suspended_at: string | null;
};

/** Comptes suspendus (RPC DEFINER admin_list_suspended). */
export async function loadSuspendedAccounts(): Promise<SuspendedAccount[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_list_suspended");
  if (error) {
    console.error("admin_list_suspended failed", error.message);
    return [];
  }
  return ((data ?? []) as SuspendedRow[]).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    suspendedAt: r.suspended_at,
  }));
}
