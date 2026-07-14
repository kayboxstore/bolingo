import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Inscription" };

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h3 text-ink">Crée ton compte</h1>
        <p className="text-legend text-ink/60">Là où les cœurs se rencontrent.</p>
      </div>
      <SignupForm />
    </div>
  );
}
