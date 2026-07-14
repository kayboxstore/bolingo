import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ResendForm } from "@/components/auth/resend-form";
import { signOut } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Vérifie ton email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? searchParams.email;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h3 text-ink">Vérifie ton email</h1>
        <p className="text-body text-ink/70">
          {email ? (
            <>
              Un lien de confirmation a été envoyé à{" "}
              <strong className="text-ink">{email}</strong>. Clique dessus pour
              activer ton compte.
            </>
          ) : (
            "Un lien de confirmation t'a été envoyé. Clique dessus pour activer ton compte."
          )}
        </p>
        <p className="text-legend text-ink/70">
          Rien reçu ? Regarde dans tes spams, ou renvoie l&apos;email. Déjà
          inscrit avec cette adresse ?{" "}
          <Link href="/login" className="font-medium text-brand hover:text-brand-hover">
            Connecte-toi
          </Link>
          .
        </p>
      </div>
      <ResendForm email={email} />
      {user && (
        <form action={signOut} className="text-center">
          <button
            type="submit"
            className="text-legend font-medium text-ink/60 underline-offset-2 hover:underline"
          >
            Se déconnecter
          </button>
        </form>
      )}
    </div>
  );
}
