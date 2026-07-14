import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback des liens email Supabase (confirmation d'inscription et recovery).
 *
 * Deux formats supportés :
 * - `?token_hash=...&type=signup|recovery|email` — template email recommandé
 *   ({{ .TokenHash }}), vérifié via verifyOtp. Fonctionne dans n'importe quel
 *   navigateur.
 * - `?code=...` — flux PKCE par défaut, échangé via exchangeCodeForSession
 *   (nécessite le navigateur d'origine).
 */
// Seuls les flux conçus dans cette brique sont acceptés (pas de magiclink…).
const ALLOWED_OTP_TYPES = ["signup", "recovery", "email"] as const satisfies
  readonly EmailOtpType[];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = (ALLOWED_OTP_TYPES as readonly string[]).includes(rawType ?? "")
    ? (rawType as EmailOtpType)
    : null;
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  const supabase = createClient();
  const isRecovery = type === "recovery" || next === "/reset-password";

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return redirect(request, next ?? (isRecovery ? "/reset-password" : "/onboarding"));
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirect(request, next ?? "/onboarding");
    }
  }

  // Lien expiré ou invalide.
  return redirect(
    request,
    isRecovery ? "/forgot-password?error=expired" : "/login?error=link",
  );
}

/**
 * N'accepte que des chemins internes — jamais d'URL absolue (open redirect).
 * Le backslash est rejeté : le parseur WHATWG traite `/\evil.com` comme
 * `//evil.com`.
 */
function sanitizeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return null;
  }
  return next;
}

function redirect(request: NextRequest, target: string) {
  return NextResponse.redirect(new URL(target, request.url));
}
