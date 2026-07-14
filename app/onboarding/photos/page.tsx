import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireStep } from "@/lib/onboarding/steps";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { PhotosManager } from "@/components/onboarding/photos-manager";

export const metadata: Metadata = { title: "Tes photos" };

export default async function PhotosPage() {
  const snapshot = await requireStep(0);
  const supabase = createClient();

  // Bucket privé : aperçus via URLs signées de courte durée.
  const paths = snapshot.photos.map((p) => p.storage_path);
  const { data: signed } =
    paths.length > 0
      ? await supabase.storage.from("profile-photos").createSignedUrls(paths, 3600)
      : { data: [] };

  const photos = snapshot.photos.map((photo, index) => ({
    id: photo.id,
    position: photo.position,
    url: signed?.[index]?.signedUrl ?? null,
  }));

  return (
    <WizardShell
      step={0}
      title="Tes photos"
      subtitle="De 1 à 6 photos. La première est ta photo principale."
    >
      <PhotosManager photos={photos} />
    </WizardShell>
  );
}
