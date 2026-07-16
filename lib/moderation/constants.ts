// Client-safe : catégories de signalement (alignées sur l'enum report_category).

export const REPORT_CATEGORIES = [
  "spam",
  "harassment",
  "inappropriate_content",
  "fake_profile",
  "underage",
  "other",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  spam: "Spam",
  harassment: "Harcèlement",
  inappropriate_content: "Contenu inapproprié",
  fake_profile: "Faux profil",
  underage: "Utilisateur mineur",
  other: "Autre",
};

export const REPORT_DETAILS_MAX = 1000;
