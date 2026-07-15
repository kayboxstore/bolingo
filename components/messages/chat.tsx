"use client";

/* eslint-disable @next/next/no-img-element -- URL signée éphémère */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  deleteMessage,
  loadOlderMessages,
  markConversationRead,
  sendMessage,
} from "@/lib/messages/actions";
import { MESSAGE_MAX } from "@/lib/messages/constants";
import type { ChatMessage, ConversationHeader } from "@/lib/messages/types";
import { ArrowLeftIcon } from "@/components/brand/icons";
import { Composer } from "@/components/messages/composer";

type Pending = ChatMessage & { status?: "sending" | "failed" };

/** Fil de conversation temps réel (EventSource → proxy SSE serveur). */
export function Chat({
  matchId,
  me,
  header,
  initialMessages,
  initialHasMore,
  initialOtherReadAt,
}: {
  matchId: string;
  me: string;
  header: ConversationHeader;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  initialOtherReadAt: string | null;
}) {
  const [messages, setMessages] = useState<Pending[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(
    initialOtherReadAt,
  );
  const [closed, setClosed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const upsert = useCallback((incoming: ChatMessage) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === incoming.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = incoming;
        return next;
      }
      // insertion triée par (createdAt, id)
      const next = [...prev, incoming];
      next.sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.id.localeCompare(b.id)
          : a.createdAt.localeCompare(b.createdAt),
      );
      return next;
    });
  }, []);

  // ---- flux temps réel -----------------------------------------------------
  useEffect(() => {
    const es = new EventSource(`/api/conversations/${matchId}/stream`);
    es.onmessage = (e) => {
      const evt = JSON.parse(e.data) as
        | { type: "ready" }
        | { type: "message"; message: ChatMessage }
        | { type: "read"; at: string | null }
        | { type: "closed" };
      if (evt.type === "message") upsert(evt.message);
      else if (evt.type === "read") setOtherReadAt(evt.at);
      else if (evt.type === "closed") {
        setClosed(true);
        es.close();
      }
    };
    es.onerror = () => {
      /* EventSource se reconnecte tout seul */
    };
    return () => es.close();
  }, [matchId, upsert]);

  // ---- marque comme lu à l'ouverture et à chaque nouveau message reçu ------
  useEffect(() => {
    void markConversationRead(matchId);
  }, [matchId, messages.length]);

  // ---- auto-scroll en bas sur nouveau message ------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function onLoadOlder() {
    if (loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const anchor = scrollRef.current;
    const prevHeight = anchor?.scrollHeight ?? 0;
    const oldest = messages.find((m) => !m.status); // 1er persisté
    if (oldest) {
      const older = await loadOlderMessages(matchId, {
        createdAt: oldest.createdAt,
        id: oldest.id,
      });
      setMessages((prev) => [...older.messages, ...prev]);
      setHasMore(older.hasMore);
      // conserve la position de lecture après préfixe
      requestAnimationFrame(() => {
        if (anchor) anchor.scrollTop = anchor.scrollHeight - prevHeight;
      });
    }
    setLoadingMore(false);
  }

  async function onSend(text: string) {
    const clientId = crypto.randomUUID();
    const optimistic: Pending = {
      id: clientId,
      senderId: me,
      content: text,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: "sending",
    };
    setMessages((prev) => [...prev, optimistic]);

    const res = await sendMessage(matchId, text, clientId);
    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== clientId);
      if (res.ok) {
        if (!next.some((m) => m.id === res.message.id)) next.push(res.message);
        next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return next;
      }
      if (res.reason === "unavailable") {
        setClosed(true);
        return next;
      }
      // échec récupérable : on garde la bulle en état « échec »
      return [...next, { ...optimistic, status: "failed" as const }];
    });
  }

  async function onDelete(id: string) {
    const res = await deleteMessage(matchId, id);
    if (res.ok) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, content: "", deletedAt: new Date().toISOString() }
            : m,
        ),
      );
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-4 border-b border-ink/10 px-6 py-4">
        <Link
          href="/messages"
          className="-m-2 rounded-btn p-2 text-ink/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-label="Retour aux conversations"
        >
          <ArrowLeftIcon className="h-6 w-6" />
        </Link>
        {header.photoUrl && (
          <img
            src={header.photoUrl}
            alt=""
            className="h-10 w-10 rounded-card object-cover"
          />
        )}
        <h1 className="truncate font-display text-body font-semibold text-ink">
          {header.displayName ?? "Profil indisponible"}
        </h1>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {hasMore && (
          <div className="flex justify-center pb-4">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={loadingMore}
              className="rounded-btn border border-ink/15 px-4 py-2 font-display text-legend font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {loadingMore ? "Chargement…" : "Messages précédents"}
            </button>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {messages.map((m) => {
            const mine = m.senderId === me;
            const deleted = Boolean(m.deletedAt);
            const seen =
              mine &&
              !deleted &&
              otherReadAt !== null &&
              otherReadAt >= m.createdAt;
            return (
              <li
                key={m.id}
                className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
              >
                <div
                  className={`group max-w-[80%] rounded-card px-4 py-2 text-body ${
                    deleted
                      ? "border border-ink/15 italic text-ink/60"
                      : mine
                        ? "bg-brand text-brand-fg"
                        : "bg-disabled text-ink"
                  }`}
                >
                  {deleted ? "Message supprimé" : m.content}
                </div>
                <div className="mt-2 flex items-center gap-2 text-legend text-ink/60">
                  {/* heure locale du client : suppressHydrationWarning évite
                      un mismatch SSR (fuseau serveur) → hydratation (client) */}
                  <time dateTime={m.createdAt} suppressHydrationWarning>
                    {new Date(m.createdAt).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  {m.status === "sending" && <span>· en attente</span>}
                  {m.status === "failed" && (
                    <span className="text-error">· échec</span>
                  )}
                  {seen && <span>· Vu</span>}
                  {mine && !deleted && !m.status && (
                    <button
                      type="button"
                      onClick={() => onDelete(m.id)}
                      aria-label={`Supprimer mon message de ${new Date(
                        m.createdAt,
                      ).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`}
                      className="-my-1 px-1 py-1 underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>

      {closed ? (
        <p className="border-t border-ink/10 px-6 py-4 text-center text-legend text-ink/70">
          Cette conversation n&apos;est plus disponible.
        </p>
      ) : (
        <Composer max={MESSAGE_MAX} onSend={onSend} />
      )}
    </div>
  );
}
