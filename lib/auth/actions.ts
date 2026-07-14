"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage, isRateLimit } from "@/lib/auth/errors";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  type FormState,
} from "@/lib/auth/validation";

/**
 * Server Actions d'authentification.
 *
 * Sécurité :
 * - Les mots de passe ne sont JAMAIS loggés ni renvoyés dans l'état du formulaire.
 * - Messages génériques partout où l'existence d'un compte pourrait fuiter.
 * - Rate limiting : limites intégrées Supabase Auth, mappées en messages clairs.
 */

/**
 * URL publique du site (liens des emails). En production, NEXT_PUBLIC_SITE_URL
 * est obligatoire : le header Origin est contrôlable par le client (poisoning
 * des liens de reset). Le fallback Origin ne sert qu'en développement.
 */
function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL doit être définie en production.");
  }
  return headers().get("origin") ?? "http://localhost:3000";
}

function fieldErrorsOf(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

// ---------------------------------------------------------------- inscription
export async function signUp(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm`,
    },
  });

  if (error) {
    // Anti-énumération : « email déjà utilisé » n'est jamais révélé ici.
    // Supabase (confirmations activées) renvoie de toute façon un succès
    // obfusqué pour les comptes existants et notifie l'utilisateur par email.
    if (isRateLimit(error)) return { error: authErrorMessage(error) };
    if (error.code === "weak_password" || error.code === "validation_failed") {
      return { error: authErrorMessage(error) };
    }
    return { error: "Une erreur est survenue. Réessaie dans un instant." };
  }

  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

// ------------------------------------------------------------------ connexion
export async function signIn(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Compte non vérifié → redirection douce, pas une erreur bloquante.
    if (error.code === "email_not_confirmed") {
      redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
    }
    if (isRateLimit(error)) return { error: authErrorMessage(error) };
    // Message générique : ne révèle pas si le compte existe.
    return { error: "Email ou mot de passe incorrect." };
  }

  redirect("/onboarding");
}

// --------------------------------------------------------- mot de passe oublié
export async function forgotPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password` },
  );

  // Le rate limit est la seule erreur montrée (ne révèle rien sur le compte).
  if (error && isRateLimit(error)) return { error: authErrorMessage(error) };

  // Réponse identique que le compte existe ou non.
  return {
    success:
      "Si un compte existe avec cette adresse, un email de réinitialisation vient d'être envoyé.",
  };
}

// ------------------------------------------------------ réinitialisation du mdp
export async function resetPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "Ce lien a expiré ou n'est plus valide. Demande un nouveau lien de réinitialisation.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    if (isRateLimit(error)) return { error: authErrorMessage(error) };
    return { error: authErrorMessage(error) };
  }

  redirect("/onboarding");
}

// ------------------------------------------------- renvoi de l'email de vérif.
export async function resendVerification(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });

  if (error && isRateLimit(error)) return { error: authErrorMessage(error) };

  // Réponse identique que le compte existe ou non.
  return { success: "Si nécessaire, un nouvel email vient d'être envoyé." };
}

// ---------------------------------------------------------------- déconnexion
export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
