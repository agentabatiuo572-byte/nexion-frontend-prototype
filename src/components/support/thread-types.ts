// Shared view-model types for the conversation thread body (ConversationThread.vue).
// Pages normalise either the nova store (AI/Nova) or the conversations store
// (advisor/support) into ThreadMsg[] before handing them to the presentational thread.

export type MessageDeliveryState = 'sending' | 'sent' | 'read' | 'failed' | 'unknown' | 'queued';
export interface ThreadMsg {
  id: string;
  /** Bubble alignment: left = agent/Nova, right = the user. */
  side: "left" | "right";
  /** Bubble tone → colour treatment. */
  tone: "agent" | "user" | "system";
  /** Pre-formatted text (supports **bold** + \n line breaks). */
  text: string;
  imageSrc?: string;
  imageLabel?: string;
  imageLoading?: boolean;
  imageError?: boolean;
  imageAttachmentId?: string;
  authorAvatarSrc?: string;
  meta?: string;
  /** Original message creation instant in epoch milliseconds; never receipt/retry time. */
  timestamp?: number;
  /** Pre-localised, authoritative receipt placed beside its own bubble. */
  receipt?: string;
  deliveryState?: MessageDeliveryState;
  /** Current local human outbox entry, not a confirmed server message. */
  localSend?: boolean;
  /** Exact original command correlation, never inferred from matching body text. */
  clientMessageId?: string;
  ctaLabel?: string;
  /** Logical route (mapped by lib/route navTo at tap time). */
  ctaHref?: string;
  queue?: {
    turnId: string;
    state: "queued" | "processing" | "tracking" | "editing" | "failed";
    label: string;
    editable: boolean;
  };
}

export interface QuickChip {
  key: string;
  emoji: string;
  label: string;
}
