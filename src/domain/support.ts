export type ConversationType = "ai" | "advisor" | "support";
export type ConversationCategoryAvailability = Record<ConversationType, boolean>;
export type ConvRoleKey = "roleAdvisor" | "roleSupport";
export type ConvSessionStatus = "active" | "closed";
export interface ConvMessage {
  id: string;
  /** Original idempotent message key echoed by the server, when supplied. */
  clientMessageId?: string;
  sender: "user" | "agent" | "system";
  status?: "sent" | "read";
  text: string;
  ts: number;
  kind?: "TEXT" | "IMAGE" | "SKU" | "LINK";
  attachmentId?: string;
  skuId?: string;
  skuName?: string;
  linkTarget?: { type: "HOME" | "WALLET" | "SUPPORT"; params: Record<string, never> };
  targetAvailability?: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  authorName?: string;
  senderId?: number;
  authorConfidence?: "VERIFIED" | "UNKNOWN";
  senderAvatar?: { assetId: string; version: number };
}
export interface Conversation {
  id: string;
  type: ConversationType;
  status: "open" | "transferred" | "resolved" | "closed";
  version: number;
  agentName: string;
  /** Stable server staff identity. A display name must never identify a thread. */
  ownerAgentId?: string | null;
  /** Server account/peer visibility boundary; never removes staff-side history. */
  userClearedThroughMessageId?: number;
  roleKey: ConvRoleKey;
  avatarTint: string;
  messages: ConvMessage[];
  unread: number;
  lastTs: number;
  /** Server maximum public message ID; list rows do not contain the transcript. */
  lastPublicMessageId?: number;
  /** Optional server provenance for a generated idle-close preview. */
  lastMessageKind?: "IDLE_TIMEOUT_CLOSE" | null;
  lastMessage: string;
  sessionStatus: ConvSessionStatus;
  /** True when the server intentionally returned only the newest message window. */
  historyTruncated?: boolean;
  /** Opaque-to-the-view cursor for the next older server-owned conversation page. */
  historyNextCursor?: number | null;
}

export interface SupportFaq {
  id: string;
  category: string;
  question: string;
  answer: string;
  language: string;
  sortOrder: number;
  version: number;
  updatedAt: number;
}

/** A configured M4 service target. It is deliberately separate from historical response statistics. */
