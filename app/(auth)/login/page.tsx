import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { FormError } from "@/components/auth/form-message";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-h3 text-ink">Bon retour</h1>
      {searchParams.error === "link" && (
        <FormError message="Ce lien est invalide ou a expiré. Connecte-toi ou demande un nouveau lien." />
      )}
      <LoginForm />
    </div>
  );
}
