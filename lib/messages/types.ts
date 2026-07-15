// Types partagés serveur/client — aucun import serveur (client-safe).

export type ConversationSummary = {
  matchId: string;
  otherUserId: string;
  displayName: string | null;
  photoUrl: string | null;
  lastMessage: string | null;
  lastMessageDeleted: boolean;
  lastMessageAt: string | null;
  unreadCount: number;
  profileAvailable: boolean;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  content: string;
  deletedAt: string | null;
  createdAt: string;
};

export type ConversationHeader = {
  matchId: string;
  otherUserId: string;
  displayName: string | null;
  photoUrl: string | null;
  profileAvailable: boolean;
};

export type MessageCursor = { createdAt: string; id: string };
