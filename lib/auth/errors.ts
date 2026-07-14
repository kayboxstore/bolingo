import type { AuthError } from "@supabase/supabase-js";

/**
 * Traduit les erreurs Supabase Auth en messages français sûrs.
 *
 * Règles :
 * - Jamais de fuite sur l'existence d'un compte (messages génériques).
 * - Les 429 / rate limits deviennent un message clair, pas une erreur brute.
 * - Le détail technique n'est jamais montré à l'utilisateur.
 */

const RATE_LIMIT_MESSAGE =
  "Trop de tentatives. Patiente quelques minutes avant de réessayer.";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email ou mot de passe incorrect.",
  email_not_confirmed: "Email non vérifié.", // géré par redirection, jamais affiché en bloquant
  over_request_rate_limit: RATE_LIMIT_MESSAGE,
  over_email_send_rate_limit: RATE_LIMIT_MESSAGE,
  otp_expired: "Ce lien a expiré. Demande un nouveau lien.",
  otp_disabled: "Ce lien n'est plus valide. Demande un nouveau lien.",
  weak_password: "Mot de passe trop faible : 8 caractères minimum, dont 1 chiffre.",
  same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
  session_expired: "Ta session a expiré. Reconnecte-toi.",
  session_not_found: "Ta session a expiré. Reconnecte-toi.",
  validation_failed: "Vérifie les informations saisies.",
  user_banned: "Ce compte est suspendu.",
};

export function isRateLimit(error: Pick<AuthError, "status" | "code">): boolean {
  return (
    error.status === 429 ||
    (error.code ?? "").includes("rate_limit")
  );
}

export function authErrorMessage(error: AuthError): string {
  if (isRateLimit(error)) return RATE_LIMIT_MESSAGE;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  return "Une erreur est survenue. Réessaie dans un instant.";
}
