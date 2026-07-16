// Client-safe : libellés FR du back-office modération.

import type { REPORT_CATEGORIES } from "@/lib/moderation/constants";

export const REPORT_STATUSES = [
  "open",
  "reviewing",
  "resolved",
  "dismissed",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: "En attente",
  reviewing: "En cours",
  resolved: "Traité",
  dismissed: "Rejeté",
};

/** Statuts « en attente de traitement » (compteur + filtre par défaut). */
export const PENDING_STATUSES: ReportStatus[] = ["open", "reviewing"];

export type ReportAction = "dismiss" | "warn" | "suspend";

export const REPORT_ACTION_LABELS: Record<ReportAction, string> = {
  dismiss: "Rejeter",
  warn: "Avertir (traiter sans suite)",
  suspend: "Suspendre le compte signalé",
};

export type AccountStatus = "active" | "suspended" | "deleted";

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Actif",
  suspended: "Suspendu",
  deleted: "Supprimé",
};

// Réexporté pour commodité (les libellés de catégorie vivent avec la modération).
export type { REPORT_CATEGORIES };
