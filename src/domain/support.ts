export type TicketStatus = "open" | "in_progress" | "pending_user" | "resolved" | "closed";
export type TicketCategory = "account" | "withdrawal" | "deposit" | "hardware" | "earnings" | "genesis" | "technical" | "other";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export interface TicketMessage {
  id: string;
  ts: number;
  author: "user" | "agent";
  agentName?: string;
  body: string;
}

export interface Ticket {
  id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  version: number;
  createdAt: number;
  updatedAt: number;
  lastReplyAt: number;
  /** Authoritative header projection; list rows do not hydrate the timeline. */
  messageCount: number;
  unread: number;
  owner: string;
  messages: TicketMessage[];
}

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  account: "Account", withdrawal: "Withdrawal", deposit: "Deposit", hardware: "Hardware",
  earnings: "Earnings", genesis: "Genesis", technical: "Technical", other: "Other",
};
export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open", in_progress: "In progress", pending_user: "Awaiting you", resolved: "Resolved", closed: "Closed",
};
export const STATUS_COLOR: Record<TicketStatus, string> = {
  open: "var(--v5-warning)", in_progress: "var(--v5-tech-cyan)", pending_user: "var(--v5-brand-2)",
  resolved: "var(--v5-brand)", closed: "var(--v5-ink-4)",
};
export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low", normal: "Normal", high: "High", urgent: "Urgent",
};

export type ConversationType = "ai" | "advisor" | "support";
export type ConvRoleKey = "roleAi" | "roleAdvisor" | "roleSupport";
export type ConvSessionStatus = "active" | "closed";
export interface ConvMessage {
  id: string;
  sender: "user" | "agent" | "system";
  status?: "sent" | "read";
  text: string;
  ts: number;
}
export interface Conversation {
  id: string;
  type: ConversationType;
  status: "open" | "transferred" | "resolved" | "closed";
  version: number;
  agentName: string;
  roleKey: ConvRoleKey;
  avatarTint: string;
  messages: ConvMessage[];
  unread: number;
  lastTs: number;
  lastMessage: string;
  sessionStatus: ConvSessionStatus;
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
