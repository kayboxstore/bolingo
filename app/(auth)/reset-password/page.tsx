import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h3 text-ink">Nouveau mot de passe</h1>
        <p className="text-legend text-ink/60">
          Choisis un nouveau mot de passe pour ton compte.
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
