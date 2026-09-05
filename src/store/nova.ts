import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Ported from Nexion-prototype/lib/store/nova.ts (zustand → Pinia).
 * Nova · in-app AI compute advisor (design doc §6.8). Remote replies come from the
 * authenticated local-AI backend; explicit mock builds retain the deterministic templates.
 * The store holds the chat transcript, an unread
 * counter, and the open flag. Auto-push triggers (driven from the app layer) call
 * `push()` to enqueue proactive Nova messages tied to mock simulator events.
 * Non-persisted (session transcript).
 *
 * Live human-agent handoff USED to morph this store in-place (mode/agentName). That
 * is now superseded by the conversation center's dedicated "support" category
 * (store/conversations.ts) — human support is reached from the conversation center
 * (the AI chat's in-header handoff pill is retired). This store is AI-only again.
 */

export type NovaSender = "nova" | "user";

export type NovaMessageKind =
  | "welcome"
  | "market-peak"
  | "idle-compute"
  | "market-event"
  | "upgrade-nudge"
  | "risk-alert"
  | "daily-summary"
  | "user-quick"
  | "nova-reply"
  | "user-text";

export interface NovaMessage {
  id: string;
  sender: NovaSender;
  kind: NovaMessageKind;
  /** Delivery receipt — only meaningful when sender === "user" (sent = unread, read = seen). */
  status?: "sent" | "read";
  text: string;        // Pre-formatted (placeholders already substituted)
  ts: number;          // epoch ms
  ctaLabel?: string;
  ctaHref?: string;
}

let counter = 1;
function nextId(): string {
  counter += 1;
  return `m${counter}-${Date.now().toString(36)}`;
}

export const useNova = defineStore("nova", () => {
  const messages = ref<NovaMessage[]>([]);   // chronological (oldest first)
  const unread = ref(0);
  const isOpen = ref(false);
  // Ephemeral "Nova is typing" flag (WS typing event in a real backend; never persisted).
  const typing = ref(false);
  // throttle keys → last fire timestamp (prevents same auto-push firing too often).
  const cooldowns = ref<Record<string, number>>({});
  let boundRemoteAccount = "";

  function bindRemoteAccount(accountKey: string) {
    const normalized = accountKey.trim();
    if (boundRemoteAccount === normalized) return;
    reset();
    boundRemoteAccount = normalized;
  }

  function open() {
    isOpen.value = true;
    unread.value = 0;
  }
  function close() {
    isOpen.value = false;
  }

  function push(
    msg: Omit<NovaMessage, "id" | "ts" | "sender">,
    opts?: { cooldownKey?: string; cooldownMs?: number },
  ): boolean {
    const t = Date.now();
    if (opts?.cooldownKey) {
      const last = cooldowns.value[opts.cooldownKey] ?? 0;
      const cooldown = opts.cooldownMs ?? 60_000;
      if (t - last < cooldown) return false;
    }
    messages.value = [
      ...messages.value,
      { ...msg, id: nextId(), ts: t, sender: "nova" },
    ];
    unread.value = isOpen.value ? 0 : unread.value + 1;
    if (opts?.cooldownKey) {
      cooldowns.value = { ...cooldowns.value, [opts.cooldownKey]: t };
    }
    return true;
  }

  function sendUser(text: string, kind: NovaMessageKind = "user-text") {
    const t = Date.now();
    messages.value = [
      ...messages.value,
      { id: nextId(), sender: "user", kind, status: "sent", text, ts: t },
    ];
  }

  /** Nova read the thread → every user message flips to "read" (已读 receipt). */
  function markUserRead() {
    messages.value = messages.value.map((m) =>
      m.sender === "user" && m.status !== "read" ? { ...m, status: "read" as const } : m,
    );
  }

  function setTyping(on: boolean) {
    typing.value = on;
  }

  function reset() {
    messages.value = [];
    unread.value = 0;
    cooldowns.value = {};
    typing.value = false;
  }

  return {
    messages, unread, isOpen, typing, cooldowns,
    open, close, push, sendUser, markUserRead, setTyping, reset, bindRemoteAccount,
  };
});
