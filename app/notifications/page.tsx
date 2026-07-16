import type { Metadata } from "next";
import { requireActiveMember } from "@/lib/auth/guards";
import { loadNotifications } from "@/lib/notifications/queries";
import { AppHeader } from "@/components/app-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { BellIcon } from "@/components/brand/icons";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireActiveMember();

  const { items, hasMore } = await loadNotifications();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <AppHeader nav />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
        <h1 className="font-display text-h2 text-ink">Notifications</h1>
        {items.length > 0 ? (
          <NotificationList initial={items} initialHasMore={hasMore} />
        ) : (
          <div className="flex flex-col items-center gap-6 rounded-card border border-ink/10 bg-white p-6 text-center shadow-sm">
            <BellIcon className="h-12 w-12 text-ink/40" />
            <p className="text-body text-ink/70">
              Aucune notification pour l&apos;instant.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
