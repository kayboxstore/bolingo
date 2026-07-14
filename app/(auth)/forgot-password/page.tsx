import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { FormError } from "@/components/auth/form-message";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h3 text-ink">Mot de passe oublié</h1>
        <p className="text-legend text-ink/60">
          Entre ton adresse email : on t&apos;envoie un lien pour choisir un
          nouveau mot de passe.
        </p>
      </div>
      {searchParams.error === "expired" && (
        <FormError message="Ce lien de réinitialisation a expiré ou n'est plus valide. Demande un nouveau lien." />
      )}
      <ForgotPasswordForm />
    </div>
  );
}
