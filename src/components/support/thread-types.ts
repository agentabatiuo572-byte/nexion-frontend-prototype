// Shared view-model types for the conversation thread body (ConversationThread.vue).
// Pages normalise either the nova store (AI/Nova) or the conversations store
// (advisor/support) into ThreadMsg[] before handing them to the presentational thread.

export interface ThreadMsg {
  id: string;
  /** Bubble alignment: left = agent/Nova, right = the user. */
  side: "left" | "right";
  /** Bubble tone → colour treatment. */
  tone: "agent" | "user" | "system";
  /** Pre-formatted text (supports **bold** + \n line breaks). */
  text: string;
  /** Pre-localised delivery receipt shown under the bubble (user messages only). */
  receipt?: string;
  ctaLabel?: string;
  /** Logical route (mapped by lib/route navTo at tap time). */
  ctaHref?: string;
}

export interface QuickChip {
  key: string;
  emoji: string;
  label: string;
}
