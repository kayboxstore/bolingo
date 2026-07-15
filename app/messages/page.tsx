import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveMember } from "@/lib/auth/guards";
import { loadConversations } from "@/lib/messages/queries";
import { AppHeader } from "@/components/app-header";
import { ConversationList } from "@/components/messages/conversation-list";
import { HeartIcon } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  await requireActiveMember();
  const conversations = await loadConversations();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <AppHeader nav />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
        <h1 className="font-display text-h2 text-ink">Messages</h1>
        {conversations.length > 0 ? (
          <ConversationList conversations={conversations} />
        ) : (
          <div className="flex flex-col items-center gap-6 rounded-card border border-ink/10 bg-white p-6 text-center shadow-sm">
            <HeartIcon className="h-12 w-12 text-accent" />
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-h3 text-ink">
                Aucune conversation
              </h2>
              <p className="text-body text-ink/70">
                Matche avec quelqu&apos;un pour commencer à discuter.
              </p>
            </div>
            <Link
              href="/discover"
              className="w-full rounded-btn bg-brand px-4 py-4 text-center font-display text-body font-semibold text-brand-fg transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Découvrir des profils
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
