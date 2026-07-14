import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-6 py-12">
      <Logo />
      <div className="flex w-full max-w-md flex-col gap-6 rounded-card border border-ink/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-h3 text-ink">Vérifie ton email</h1>
          <p className="text-body text-ink/70">
            {email ? (
              <>
                Un lien de confirmation a été envoyé à{" "}
                <strong className="text-ink">{email}</strong>. Clique dessus
                pour activer ton compte.
              </>
            ) : (
              "Un lien de confirmation t'a été envoyé. Clique dessus pour activer ton compte."
            )}
          </p>
          <p className="text-legend text-ink/50">
            Rien reçu ? Regarde dans tes spams, ou renvoie l&apos;email. Déjà
            inscrit avec cette adresse ?{" "}
            <a href="/login" className="font-medium text-brand hover:text-brand-hover">
              Connecte-toi
            </a>
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
    </main>
  );
}
