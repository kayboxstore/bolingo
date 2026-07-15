import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireActiveMember } from "@/lib/auth/guards";
import {
  loadConversationHeader,
  loadMessages,
  otherLastRead,
} from "@/lib/messages/queries";
import { AppHeader } from "@/components/app-header";
import { Chat } from "@/components/messages/chat";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: {
  params: { matchId: string };
}) {
  const { user } = await requireActiveMember();

  const header = await loadConversationHeader(params.matchId);
  if (!header) notFound(); // match inexistant / inactif / pas le mien

  const [{ messages, hasMore }, readAt] = await Promise.all([
    loadMessages(params.matchId),
    otherLastRead(params.matchId),
  ]);

  return (
    <div className="flex h-screen flex-col bg-white">
      <AppHeader nav />
      <Chat
        matchId={params.matchId}
        me={user.id}
        header={header}
        initialMessages={messages}
        initialHasMore={hasMore}
        initialOtherReadAt={readAt}
      />
    </div>
  );
}
