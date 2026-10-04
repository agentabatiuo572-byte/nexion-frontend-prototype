// Conversation-center mock data — multi-category human support (advisor / support)
// alongside the Nova AI advisor. Pure data, zero framework deps, backend-replaceable
// (serialisable, action-driven, ms-epoch timestamps). The "ai" type is virtual —
// it is backed by the existing `nova` store, so this mock only seeds the human
// categories. A real backend returns ConvMessage.text directly; the mock instead
// references i18n seed keys (textKey/ctaKey) so seed copy stays bilingual + on-brand.

import type { Messages } from "@/i18n/messages/en";

type ConvNs = Messages["conversations"];

/** i18n key for a seeded message body (resolved via `t.conversations.seed[...]`). */
export type ConvSeedKey = keyof ConvNs["seed"];
/** i18n key for a seeded CTA label (resolved via `t.conversations.cta[...]`). */
export type ConvCtaKey = keyof ConvNs["cta"];
/** i18n key for a runtime agent reply template (resolved via `t.conversations[...]`). */
export type ConvReplyKey = (typeof ADVISOR_REPLY_KEYS)[number] | (typeof SUPPORT_REPLY_KEYS)[number];

/** Customer-service categories. "ai" is virtual (nova-backed); store holds the rest. */
export type ConversationType = "ai" | "advisor" | "support";

/** i18n key for a conversation's role subtitle (`t.conversations[roleKey]`). */
export type ConvRoleKey = "roleAi" | "roleAdvisor" | "roleSupport";

/** Delivery receipt for user-sent messages: sent = delivered/unread, read = seen by agent. */
export type ConvMessageStatus = "sent" | "read";

/** Support-session lifecycle. Advisor/AI channels never close; support sessions
 *  time out after inactivity (real backend: server closes + pushes the status). */
export type ConvSessionStatus = "active" | "closed";

export interface ConvMessage {
  id: string;
  sender: "user" | "agent" | "system";
  /** Receipt state — only meaningful when sender === "user". */
  status?: ConvMessageStatus;
  /** Literal text (runtime-sent messages / real backend). */
  text?: string;
  /** i18n seed key (mock seed) — preferred over `text` when present. */
  textKey?: ConvSeedKey;
  /** i18n CTA label key (seed messages only). */
  ctaKey?: ConvCtaKey;
  /** Logical route the CTA navigates to (mapped by lib/route navTo). */
  ctaHref?: string;
  /** Extra fmt() params for textKey resolution (e.g. idle-warn countdown minutes).
   *  A real backend pushes parameterised notification templates the same way. */
  textArgs?: Record<string, string | number>;
  ts: number;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  agentName: string;
  roleKey: ConvRoleKey;
  /** Avatar/icon tint — v5 token, theme-aware. */
  avatarTint: string;
  messages: ConvMessage[];
  unread: number;
  lastTs: number;
  /** Session lifecycle — only support sessions ever flip to "closed" (idle timeout). */
  sessionStatus: ConvSessionStatus;
  /** Set when the idle warning for the CURRENT quiet spell has been posted; any new
   *  message (either side) clears it so the next quiet spell warns again. */
  idleWarnedAt: number | null;
}

const MIN = 60_000;
const HOUR = 3600_000;
const DAY = 86_400_000;

/** Support-session idle policy (minutes, plain numbers — canon-sentinel anchors).
 *  Mirrors the admin console defaults (M3 即时会话台 · 超时策略, keys
 *  I.session.policy.idleWarnMins / idleCloseMins). Real backend owns the live
 *  values (server warns/closes and pushes the status change); these are the
 *  documented mock defaults, cross-repo parity enforced by canon-sentinel.
 *  NOTE mock 阶段两端不互通:admin 原型面板改的运行值只在 admin 侧演示生效,
 *  本端始终按这两个常量跑;接真后台后两端才共读服务端配置。 */
export const SUPPORT_IDLE_WARN_MINS = 1;
export const SUPPORT_IDLE_CLOSE_MINS = 5;
export const SUPPORT_IDLE_WARN_MS = SUPPORT_IDLE_WARN_MINS * MIN;
export const SUPPORT_SESSION_TIMEOUT_MS = SUPPORT_IDLE_CLOSE_MINS * MIN;

/** Support routing pool — a fresh session is assigned the next agent after the
 *  most recent one, so a timed-out session never reconnects to the same agent. */
export const SUPPORT_AGENT_POOL = ["Sarah K.", "Alex M.", "Priya N.", "Leo T."] as const;

export function nextSupportAgent(prevAgentName?: string): string {
  const idx = SUPPORT_AGENT_POOL.indexOf((prevAgentName ?? "") as (typeof SUPPORT_AGENT_POOL)[number]);
  return SUPPORT_AGENT_POOL[(idx + 1) % SUPPORT_AGENT_POOL.length];
}

// ─── Runtime agent-reply templates (cycled in order, like nova's AGENT_REPLIES) ───
// `as const satisfies` proves each key exists on the conversations namespace at
// compile time; indexing with the literal element then yields a string.
export const ADVISOR_REPLY_KEYS = [
  "advisorReply1",
  "advisorReply2",
  "advisorReply3",
] as const satisfies readonly (keyof ConvNs)[];

export const SUPPORT_REPLY_KEYS = [
  "supportReply1",
  "supportReply2",
  "supportReply3",
  "supportReply4",
] as const satisfies readonly (keyof ConvNs)[];

export function replyKeysForType(type: ConversationType): readonly ConvReplyKey[] {
  return type === "advisor" ? ADVISOR_REPLY_KEYS : SUPPORT_REPLY_KEYS;
}

// ─── Seed conversations (advisor reaches out proactively; support is a prior
// user-initiated thread kept as history — support sessions time out and a restart
// opens a NEW session with a rotated agent, never reopens this one). Re-seeded each
// session, non-persisted
// (mirrors the nova transcript), so the advisor's proactive unread is always a
// live touchpoint on landing. ───
export function seedConversations(now: number = Date.now()): Conversation[] {
  return [
    {
      id: "cv-advisor-1",
      type: "advisor",
      agentName: "Mia",
      roleKey: "roleAdvisor",
      avatarTint: "var(--v5-brand)",
      unread: 2,
      lastTs: now - 12 * MIN,
      sessionStatus: "active",
      idleWarnedAt: null,
      messages: [
        { id: "ad-1", sender: "agent", textKey: "advisorWelcome", ts: now - 3 * HOUR },
        { id: "ad-2", sender: "agent", textKey: "advisorIdleGpu", ctaKey: "browseStore", ctaHref: "/store", ts: now - 40 * MIN },
        { id: "ad-3", sender: "agent", textKey: "advisorStaking", ctaKey: "lockStaking", ctaHref: "/staking", ts: now - 12 * MIN },
      ],
    },
    {
      id: "cv-support-1",
      type: "support",
      agentName: "Sarah K.",
      roleKey: "roleSupport",
      avatarTint: "var(--v5-tech-cyan)",
      unread: 0,
      lastTs: now - 5 * HOUR,
      // 5h idle → the first timeout sweep closes it, so the reassignment flow is live.
      sessionStatus: "active",
      idleWarnedAt: null,
      messages: [
        { id: "sp-1", sender: "user", textKey: "supportUserQ", status: "read", ts: now - 6 * HOUR },
        { id: "sp-2", sender: "agent", textKey: "supportResolved", ts: now - 5 * HOUR },
      ],
    },
  ];
}
