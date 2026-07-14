import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Garde de routes :
 * - non authentifié  → pages publiques uniquement, sinon /login
 * - authentifié non vérifié → /verify-email (+ /auth/*), rien d'autre
 * - authentifié vérifié → l'app ; les pages d'auth redirigent vers /onboarding
 *   (exception : /reset-password, accessible avec une session recovery)
 */

// Accessibles sans session — et sans intérêt pour un utilisateur vérifié
// (qui en est redirigé). /verify-email est public : un login sur un compte
// non vérifié n'ouvre pas de session mais doit atterrir sur cet écran.
const AUTH_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-email",
];

function matches(path: string, bases: string[]): boolean {
  return bases.some((base) => path === base);
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  // Les callbacks d'auth (confirmation email, recovery) passent toujours.
  if (path.startsWith("/auth/")) return response;

  const redirectTo = (target: string) => {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    // Préserve les cookies de session rafraîchis par updateSession.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user) {
    if (matches(path, AUTH_PATHS)) return response;
    return redirectTo("/login");
  }

  const verified = Boolean(user.email_confirmed_at);

  if (!verified) {
    if (path === "/verify-email") return response;
    return redirectTo("/verify-email");
  }

  // Vérifié : les écrans d'auth n'ont plus lieu d'être.
  if (matches(path, AUTH_PATHS)) {
    return redirectTo("/onboarding");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tout sauf les assets connus. Pas d'exclusion générique par extension
     * d'image : une future route (photos de profils…) doit rester gardée.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)",
  ],
};
