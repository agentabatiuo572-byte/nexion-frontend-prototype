import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import type { NovaFailure } from "@/lib/nova-failure";

/**
 * Ported from Nexion-prototype/lib/store/nova.ts (zustand → Pinia).
 * Nova · in-app AI compute advisor (design doc §6.8). Remote replies come from the
 * authenticated local-AI backend; explicit mock builds retain the deterministic templates.
 * The store holds the currently rendered chat transcript, while authenticated
 * remote history is restored from the Java-owned durable conversation table.
 * counter, and the open flag. Auto-push triggers (driven from the app layer) call
 * `push()` to enqueue proactive Nova messages tied to mock simulator events.
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
  turnId?: string;
  language?: "en" | "zh" | "vi";
  delivery?: "queued" | "processing" | "tracking" | "editing" | "failed";
  failure?: NovaFailure;
  attempted?: boolean;
  /** The server may still own this turn after a client timeout or transport abort. */
  serverPending?: boolean;
}

export interface NovaRemoteHistory {
  conversationId: string | null;
  messages: Array<{ id: string; sender: NovaSender; text: string; ts: number }>;
  truncated?: boolean;
  nextCursor?: string | null;
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
  const conversationId = ref("");
  const conversationBoundary = ref(0);
  // Pending text stays in memory, not browser storage. Reopening this page keeps
  // the same turn ID; a full app reload restores only server-confirmed history.
  const pendingRemote = computed(() => messages.value.filter(m => m.delivery));
  const historyLoaded = ref(false);
  const historyTruncated = ref(false);
  const historyNextCursor = ref<string | null>(null);
  let boundRemoteAccount = "";
  let historyGeneration = 0;
  let historyLoad: { accountKey: string; generation: number; promise: Promise<void> } | undefined;

  function bindRemoteAccount(accountKey: string) {
    const normalized = accountKey.trim();
    if (boundRemoteAccount === normalized && conversationId.value) return;
    const nextConversationId = requireCryptoUuid();
    clearTranscript();
    historyLoaded.value = false;
    conversationBoundary.value += 1;
    historyGeneration += 1;
    historyLoad = undefined;
    boundRemoteAccount = normalized;
    conversationId.value = nextConversationId;
  }

  async function ensureRemoteHistory(
    accountKey: string,
    loader: () => Promise<NovaRemoteHistory>,
  ): Promise<void> {
    const normalized = accountKey.trim();
    bindRemoteAccount(normalized);
    if (historyLoaded.value || pendingRemote.value.length) return;
    const generation = historyGeneration;
    const expectedConversationId = conversationId.value;
    if (historyLoad?.accountKey === normalized && historyLoad.generation === generation) {
      return historyLoad.promise;
    }
    const promise = (async () => {
      const history = await loader();
      if (generation !== historyGeneration || normalized !== boundRemoteAccount
          || expectedConversationId !== conversationId.value || pendingRemote.value.length) return;
      if (history.conversationId) {
        hydrateRemote(normalized, history.conversationId, history.messages, history.truncated === true, history.nextCursor ?? null);
      } else {
        historyTruncated.value = history.truncated === true;
        historyNextCursor.value = history.nextCursor ?? null;
        historyLoaded.value = true;
      }
    })();
    historyLoad = { accountKey: normalized, generation, promise };
    try {
      await promise;
    } finally {
      if (historyLoad?.promise === promise) historyLoad = undefined;
    }
  }

  function hydrateRemote(
    accountKey: string,
    remoteConversationId: string,
    remoteMessages: Array<{ id: string; sender: NovaSender; text: string; ts: number }>,
    truncated = false,
    nextCursor: string | null = null,
  ) {
    const normalized = accountKey.trim();
    if (!normalized || normalized !== boundRemoteAccount || pendingRemote.value.length) return;
    conversationId.value = remoteConversationId;
    messages.value = remoteMessages.map((message) => ({
      id: message.id,
      sender: message.sender,
      kind: message.sender === "user" ? "user-text" : "nova-reply",
      status: message.sender === "user" ? "read" : undefined,
      text: message.text,
      ts: message.ts,
    }));
    unread.value = 0;
    typing.value = false;
    historyTruncated.value = truncated;
    historyNextCursor.value = nextCursor;
    historyLoaded.value = true;
  }

  async function loadEarlierRemote(accountKey: string, loader: (cursor: string) => Promise<NovaRemoteHistory>): Promise<void> {
    const normalized = accountKey.trim();
    const cursor = historyNextCursor.value;
    if (!cursor || normalized !== boundRemoteAccount || pendingRemote.value.length) return;
    const generation = historyGeneration;
    const expectedConversationId = conversationId.value;
    const history = await loader(cursor);
    if (generation !== historyGeneration || normalized !== boundRemoteAccount
        || expectedConversationId !== conversationId.value || pendingRemote.value.length
        || history.conversationId !== expectedConversationId) return;
    const existing = new Map(messages.value.map(message => [message.id, message]));
    for (const message of history.messages) {
      if (!existing.has(message.id)) existing.set(message.id, {
        id: message.id, sender: message.sender,
        kind: message.sender === "user" ? "user-text" : "nova-reply",
        status: message.sender === "user" ? "read" : undefined,
        text: message.text, ts: message.ts,
      });
    }
    messages.value = [...existing.values()].sort((left, right) => left.ts - right.ts || left.id.localeCompare(right.id));
    historyTruncated.value = history.truncated === true;
    historyNextCursor.value = history.nextCursor ?? null;
  }

  function enqueueRemote(turnId: string, text: string, language: "en" | "zh" | "vi"): boolean {
    if (!conversationId.value || !text.trim() || text.length > 2000
        || pendingRemote.value.length >= 4 || messages.value.some(m => m.turnId === turnId)) return false;
    messages.value.push({ id: `${turnId}:user`, turnId, language, sender: "user",
      kind: "user-text", status: "sent", delivery: "queued", text: text.trim(), ts: Date.now() });
    historyLoaded.value = true;
    return true;
  }

  function claimRemote() {
    const head = pendingRemote.value[0];
    if (!head || !["queued", "tracking"].includes(head.delivery!)) return;
    const tracking = head.serverPending === true;
    head.delivery = "processing";
    head.attempted = true;
    head.status = "read";
    head.failure = undefined;
    return { turnId: head.turnId!, text: head.text, language: head.language!, tracking };
  }

  function completeRemote(turnId: string, reply: string) {
    const index = messages.value.findIndex(m => m.turnId === turnId && m.delivery === "processing");
    if (index < 0) return;
    messages.value[index].delivery = undefined;
    messages.value[index].failure = undefined;
    messages.value[index].serverPending = undefined;
    messages.value.splice(index + 1, 0, { id: `${turnId}:nova`, sender: "nova",
      kind: "nova-reply", text: reply, ts: Date.now() });
  }

  function failRemote(turnId: string, failure: NovaFailure) {
    const head = pendingRemote.value[0];
    if (head?.turnId !== turnId || !["processing", "tracking"].includes(head.delivery!)) return;
    head.delivery = "failed";
    head.failure = failure;
    head.serverPending = failure === "timeout" ? true : undefined;
  }

  function trackRemote(turnId: string): boolean {
    const head = pendingRemote.value[0];
    if (head?.turnId !== turnId || head.delivery !== "processing") return false;
    head.delivery = "tracking";
    head.failure = undefined;
    head.serverPending = true;
    return true;
  }

  function retryRemote(turnId: string): boolean {
    const head = pendingRemote.value[0];
    if (head?.turnId !== turnId || head.delivery !== "failed") return false;
    head.delivery = "queued";
    head.failure = undefined;
    return true;
  }

  function editRemote(turnId: string): boolean {
    const item = pendingRemote.value.find(m => m.turnId === turnId);
    if (item?.delivery !== "queued" || item.attempted) return false;
    item.delivery = "editing";
    return true;
  }

  function saveRemoteEdit(turnId: string, text: string): boolean {
    const item = pendingRemote.value.find(m => m.turnId === turnId);
    if (item?.delivery !== "editing" || !text.trim() || text.length > 2000) return false;
    item.text = text.trim();
    item.delivery = "queued";
    return true;
  }

  function cancelRemoteEdit(turnId: string): boolean {
    const item = pendingRemote.value.find(m => m.turnId === turnId);
    if (item?.delivery !== "editing") return false;
    item.delivery = "queued";
    return true;
  }

  function cancelRemote(turnId: string): boolean {
    const item = pendingRemote.value.find(m => m.turnId === turnId);
    if (!item || item.attempted || !["queued", "editing"].includes(item.delivery!)) return false;
    messages.value = messages.value.filter(m => m !== item);
    return true;
  }

  function interruptRemote() {
    for (const item of pendingRemote.value) {
      if (item.delivery === "processing") trackRemote(item.turnId!);
      if (item.delivery === "editing") item.delivery = "queued";
    }
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

  function clearTranscript() {
    messages.value = [];
    unread.value = 0;
    cooldowns.value = {};
    typing.value = false;
    historyTruncated.value = false;
    historyNextCursor.value = null;
  }

  function startNewConversation() {
    const nextConversationId = requireCryptoUuid();
    clearTranscript();
    conversationBoundary.value += 1;
    historyGeneration += 1;
    historyLoad = undefined;
    conversationId.value = nextConversationId;
    historyLoaded.value = true;
  }

  function reset() {
    clearTranscript();
    conversationBoundary.value += 1;
    historyGeneration += 1;
    historyLoad = undefined;
    boundRemoteAccount = "";
    conversationId.value = "";
    historyLoaded.value = false;
  }

  return {
    messages, unread, isOpen, typing, cooldowns, conversationId, conversationBoundary,
    open, close, push, sendUser, markUserRead, setTyping, reset, startNewConversation,
    bindRemoteAccount, hydrateRemote, ensureRemoteHistory, loadEarlierRemote,
    pendingRemote, historyLoaded, historyTruncated, historyNextCursor, enqueueRemote, claimRemote, completeRemote, failRemote,
    retryRemote, trackRemote, editRemote, saveRemoteEdit, cancelRemoteEdit, cancelRemote, interruptRemote,
  };
});
