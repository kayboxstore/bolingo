import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStep } from "@/lib/onboarding/steps";
import {
  GENDER_LABELS,
  type Gender,
  ageOf,
} from "@/lib/onboarding/validation";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { CompleteButton } from "@/components/onboarding/complete-button";

export const metadata: Metadata = { title: "Récapitulatif" };

/* eslint-disable @next/next/no-img-element -- URLs signées éphémères */

function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: React.ReactNode;
  href: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink/10 py-2 last:border-0">
      <div className="flex flex-col gap-2">
        <p className="text-legend text-ink/70">{label}</p>
        <p className="text-body text-ink">{value}</p>
      </div>
      <Link
        href={href}
        className="text-legend text-brand hover:text-brand-hover"
      >
        Modifier
      </Link>
    </div>
  );
}

export default async function ReviewPage() {
  const snapshot = await requireStep(5);
  const profile = snapshot.profile!;
  const supabase = createClient();

  const paths = snapshot.photos.map((p) => p.storage_path);
  const { data: signed } =
    paths.length > 0
      ? await supabase.storage.from("profile-photos").createSignedUrls(paths, 900)
      : { data: [] };

  const genderLabel = profile.gender
    ? GENDER_LABELS[profile.gender as Gender]
    : "—";
  const interested =
    profile.interested_in.length > 0
      ? profile.interested_in
          .map((g) => GENDER_LABELS[g as Gender] ?? g)
          .join(", ")
      : "—";
  const age = profile.birthdate
    ? `${ageOf(new Date(`${profile.birthdate}T00:00:00Z`))} ans`
    : "—";

  return (
    <WizardShell
      step={5}
      title="Tout est bon ?"
      subtitle="Vérifie ton profil avant de le valider."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-legend text-ink/70">
            Photos ({snapshot.photos.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {snapshot.photos.map((photo, index) =>
              signed?.[index]?.signedUrl ? (
                <img
                  key={photo.id}
                  src={signed[index].signedUrl}
                  alt={`Photo ${index + 1}`}
                  className="aspect-square w-full rounded-btn object-cover"
                />
              ) : (
                <div
                  key={photo.id}
                  className="aspect-square w-full rounded-btn bg-disabled"
                />
              ),
            )}
          </div>
          <Link
            href="/onboarding/photos"
            className="self-end text-legend text-brand hover:text-brand-hover"
          >
            Modifier
          </Link>
        </div>
        <div className="flex flex-col">
          <Row
            label="Prénom · âge"
            value={`${profile.display_name ?? "—"} · ${age}`}
            href="/onboarding/basics"
          />
          <Row label="Genre" value={genderLabel} href="/onboarding/basics" />
          <Row
            label="Bio"
            value={profile.bio || "(vide)"}
            href="/onboarding/bio"
          />
          <Row
            label="Je veux rencontrer"
            value={`${interested} · ${profile.age_min}–${profile.age_max} ans`}
            href="/onboarding/preferences"
          />
          <Row
            label="Ville"
            value={profile.city ?? "—"}
            href="/onboarding/location"
          />
        </div>
        <CompleteButton />
      </div>
    </WizardShell>
  );
}
