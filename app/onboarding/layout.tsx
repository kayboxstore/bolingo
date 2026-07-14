import { AppHeader } from "@/components/app-header";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <AppHeader />
      <main className="flex flex-1 flex-col px-6 py-8">{children}</main>
    </div>
  );
}
