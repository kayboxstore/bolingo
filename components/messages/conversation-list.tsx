/* eslint-disable @next/next/no-img-element -- URLs signées éphémères, hors next/image */

import Link from "next/link";
import type { ConversationSummary } from "@/lib/messages/types";

/** Liste des conversations, triée serveur par dernière activité. */
export function ConversationList({
  conversations,
}: {
  conversations: ConversationSummary[];
}) {
  return (
    <ul className="flex flex-col gap-2">
      {conversations.map((c) => (
        <li key={c.matchId}>
          <Link
            href={`/messages/${c.matchId}`}
            className="flex items-center gap-4 rounded-card border border-ink/10 bg-white p-6 shadow-sm transition hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {c.photoUrl ? (
              <img
                src={c.photoUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-card object-cover"
              />
            ) : (
              <div className="h-14 w-14 shrink-0 rounded-card bg-disabled" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-display text-body font-semibold text-ink">
                  {c.profileAvailable ? c.displayName : "Profil indisponible"}
                </span>
                {c.unreadCount > 0 && (
                  <span className="shrink-0 rounded-full bg-brand px-2 py-1 text-legend text-brand-fg">
                    {c.unreadCount}
                  </span>
                )}
              </div>
              <p
                className={`truncate text-legend ${
                  c.unreadCount > 0 ? "font-semibold text-ink" : "text-ink/70"
                }`}
              >
                {c.lastMessageDeleted
                  ? "Message supprimé"
                  : (c.lastMessage ?? "Dites bonjour 👋")}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
