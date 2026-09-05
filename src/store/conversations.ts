import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { supportApi } from "@/api/runtime";
import { remoteApiEnabled } from "@/api/runtime";
import { asApiError } from "@/api/errors";
import type { Conversation, ConversationType, TicketCategory } from "@/domain/support";

function mutationKey(scope: string): string {
  const label = scope.split(":", 1)[0].replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "command";
  return `support-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
const PENDING_STORAGE = "support-pending-commands";
const pendingStorageKey = (accountKey: string, runId: string) => `${PENDING_STORAGE}:${accountKey}:${runId}:conversations`;
async function opaqueIntentSlot(intent: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(intent));
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
function restorePending(accountKey: string, runId: string): Map<string, string> {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem(pendingStorageKey(accountKey, runId)) ?? "{}") as Record<string, string>).filter(([slot, key]) => /^sha256:[a-f0-9]{64}$/.test(slot) && /^support-[a-z0-9-]+-/.test(key))); } catch { return new Map(); }
}
function persistPending(accountKey: string, runId: string, values: Map<string, string>) {
  try { localStorage.setItem(pendingStorageKey(accountKey, runId), JSON.stringify(Object.fromEntries(values))); } catch { /* H5 storage can be unavailable */ }
}
type CommandScope = { accountKey: string; epoch: number; runId: string; pending: Map<string, string>; inFlight: Map<string, Promise<unknown>> };
type SnapshotScope = { accountKey: string; epoch: number; runId: string };

export const useConversations = defineStore("conversations", () => {
  const conversations = ref<Conversation[]>([]);
  const loading = ref(false);
  const mutating = ref(false);
  const error = ref<string | null>(null);
  const typingIds = ref<Record<string, boolean>>({});
  const totalUnread = computed(() => conversations.value.reduce((sum, row) => sum + row.unread, 0));
  let pendingKeys = new Map<string, string>();
  let inFlight = new Map<string, Promise<unknown>>();
  let accountEpoch = 0;
  let accountKeyValue = "anonymous";
  let pendingRunId = "unverified";
  const openGeneration = new Map<string, number>();
  let listRequestGeneration = 0;

  async function preparePendingRun(): Promise<void> {
    const accountKey = accountKeyValue;
    const epoch = accountEpoch;
    const runId = await supportApi.acceptanceRunId();
    if (epoch !== accountEpoch || accountKey !== accountKeyValue) return;
    if (runId === pendingRunId) return;
    pendingRunId = runId;
    pendingKeys = restorePending(accountKey, runId);
  }

  function scopeIsCurrent(scope: CommandScope): boolean {
    return scope.epoch === accountEpoch && scope.accountKey === accountKeyValue && scope.runId === pendingRunId && scope.pending === pendingKeys && scope.inFlight === inFlight;
  }

  function snapshotScope(): SnapshotScope { return { accountKey: accountKeyValue, epoch: accountEpoch, runId: pendingRunId }; }
  function snapshotIsCurrent(scope: SnapshotScope): boolean {
    return scope.epoch === accountEpoch && scope.accountKey === accountKeyValue && scope.runId === pendingRunId;
  }

  async function commandScope(): Promise<CommandScope> {
    const accountKey = accountKeyValue;
    const epoch = accountEpoch;
    const startingRunId = pendingRunId;
    const startingPending = pendingKeys;
    const startingInFlight = inFlight;
    const runId = await supportApi.acceptanceRunId();
    if (epoch !== accountEpoch || accountKey !== accountKeyValue || startingRunId !== pendingRunId
      || startingPending !== pendingKeys || startingInFlight !== inFlight) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    if (runId !== pendingRunId) {
      pendingRunId = runId;
      pendingKeys = restorePending(accountKey, runId);
    }
    return { accountKey, epoch, runId, pending: pendingKeys, inFlight };
  }

  function mustReadBack(cause: unknown): boolean {
    const error = asApiError(cause);
    return error.status === 409 || (error.status ?? 0) >= 500 || error.kind === "network" || error.kind === "protocol";
  }

  async function command<T>(intent: string, action: (key: string) => Promise<T>, recover?: (key: string) => Promise<T | null>): Promise<T> {
    const scope = await commandScope();
    const fingerprint = await opaqueIntentSlot(intent);
    if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    const running = scope.inFlight.get(fingerprint) as Promise<T> | undefined;
    if (running) return running;
    const key = scope.pending.get(fingerprint) ?? mutationKey(intent);
    scope.pending.set(fingerprint, key);
    persistPending(scope.accountKey, scope.runId, scope.pending);
    if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    const promise = action(key);
    scope.inFlight.set(fingerprint, promise);
    if (scopeIsCurrent(scope)) mutating.value = true;
    try {
      const result = await promise;
      scope.pending.delete(fingerprint);
      persistPending(scope.accountKey, scope.runId, scope.pending);
      return result;
    } catch (cause) {
      if (recover && mustReadBack(cause) && scopeIsCurrent(scope)) {
        const adopted = await recover(key);
        if (adopted !== null) {
          scope.pending.delete(fingerprint);
          persistPending(scope.accountKey, scope.runId, scope.pending);
          return adopted;
        }
      }
      throw cause;
    } finally {
      scope.inFlight.delete(fingerprint);
      if (scopeIsCurrent(scope)) mutating.value = scope.inFlight.size > 0;
    }
  }

  function replace(conversation: Conversation) {
    const prior = conversations.value.find((row) => row.id === conversation.id);
    if (prior && (conversation.version < prior.version || (conversation.version === prior.version && conversation.lastTs < prior.lastTs))) return;
    const rest = conversations.value.filter((row) => row.id !== conversation.id);
    conversations.value = [conversation, ...rest].sort((a, b) => b.lastTs - a.lastTs);
  }

  /** A delayed page may add an absent row, but cannot erase or regress a newer live snapshot. */
  function mergeConversations(items: Conversation[]) { for (const conversation of items) replace(conversation); }

  async function refresh(): Promise<void> {
    const epoch = accountEpoch;
    loading.value = true;
    error.value = null;
    try {
      await preparePendingRun();
      const scope = snapshotScope();
      if (scope.epoch !== epoch) return;
      const requestGeneration = ++listRequestGeneration;
      await reconcilePending();
      if (!snapshotIsCurrent(scope) || requestGeneration !== listRequestGeneration) return;
      const items = (await supportApi.conversations()).items;
      if (snapshotIsCurrent(scope) && requestGeneration === listRequestGeneration) mergeConversations(items);
    } catch (cause) {
      if (epoch === accountEpoch) {
        error.value = cause instanceof Error ? cause.message : "SUPPORT_CONVERSATIONS_LOAD_FAILED";
      }
      throw cause;
    } finally {
      if (epoch === accountEpoch) loading.value = false;
    }
  }

  function byType(type: ConversationType): Conversation[] {
    return conversations.value.filter((row) => row.type === type).sort((a, b) => b.lastTs - a.lastTs);
  }
  function get(id: string): Conversation | undefined { return conversations.value.find((row) => row.id === id); }

  async function open(id: string, active: () => boolean = () => true): Promise<Conversation> {
    const epoch = accountEpoch;
    const accountKey = accountKeyValue;
    const runId = pendingRunId;
    const requestGeneration = (openGeneration.get(id) ?? 0) + 1;
    openGeneration.set(id, requestGeneration);
    error.value = null;
    let conversation = await supportApi.conversation(id);
    if (epoch !== accountEpoch || accountKey !== accountKeyValue || runId !== pendingRunId || openGeneration.get(id) !== requestGeneration || !active()) return conversation;
    const lastAgent = [...conversation.messages].reverse().find(message => message.sender === "agent");
    if (conversation.unread > 0 && lastAgent) {
      try {
        conversation = await supportApi.markConversationRead(conversation, Number(lastAgent.id));
      } catch (cause) {
        if (mustReadBack(cause)) {
          try { conversation = await supportApi.conversation(id); } catch { /* retain the prior server snapshot */ }
        }
        error.value = cause instanceof Error ? cause.message : "SUPPORT_CONVERSATION_READ_FAILED";
      }
    }
    if (epoch === accountEpoch && accountKey === accountKeyValue && runId === pendingRunId && openGeneration.get(id) === requestGeneration && active()) replace(conversation);
    return conversation;
  }

  async function reconcile(id: string, epoch: number): Promise<void> {
    try {
      const accountKey = accountKeyValue;
      const runId = pendingRunId;
      const requestGeneration = (openGeneration.get(id) ?? 0) + 1;
      openGeneration.set(id, requestGeneration);
      const conversation = await supportApi.conversation(id);
      if (epoch === accountEpoch && accountKey === accountKeyValue && runId === pendingRunId && openGeneration.get(id) === requestGeneration) replace(conversation);
    } catch {
      // The original failure remains authoritative; reconciliation is best effort.
    }
  }

  async function reconcileAll(epoch: number): Promise<void> {
    try {
      const accountKey = accountKeyValue;
      await preparePendingRun();
      if (epoch !== accountEpoch || accountKey !== accountKeyValue) return;
      const scope = snapshotScope();
      const requestGeneration = ++listRequestGeneration;
      const items = (await supportApi.conversations()).items;
      if (snapshotIsCurrent(scope) && requestGeneration === listRequestGeneration) mergeConversations(items);
    } catch {
      // The original failure remains authoritative; reconciliation is best effort.
    }
  }

  async function reconcilePending(): Promise<void> {
    const scope: CommandScope = { accountKey: accountKeyValue, epoch: accountEpoch, runId: pendingRunId, pending: pendingKeys, inFlight };
    for (const [fingerprint, key] of [...scope.pending]) {
      try {
        const result = await supportApi.commandResult(key);
        if (!result) continue;
        if (scopeIsCurrent(scope) && result.kind === "conversation") replace(result.conversation);
        if (scopeIsCurrent(scope) && result.kind === "conversation-ticket") replace(result.conversation);
        if (result.kind !== "conversation" && result.kind !== "conversation-ticket") continue;
        scope.pending.delete(fingerprint);
        persistPending(scope.accountKey, scope.runId, scope.pending);
      } catch { /* unknown remains durable until the authoritative readback succeeds */ }
    }
  }

  async function startConversation(type: Exclude<ConversationType, "ai">, openingText: string): Promise<string> {
    const epoch = accountEpoch;
    let conversation: Conversation;
    try {
      conversation = await command(`conversation-create:${type}:${openingText.trim()}`,
        key => supportApi.startConversation(type, openingText, key), async key => {
          const result = await supportApi.commandResult(key);
          return result?.kind === "conversation" ? result.conversation : null;
        });
    } catch (cause) {
      if (mustReadBack(cause)) await reconcileAll(epoch);
      throw cause;
    }
    if (epoch === accountEpoch) replace(conversation);
    return conversation.id;
  }

  async function startSupportSession(openingText: string): Promise<string> {
    return startConversation("support", openingText);
  }

  async function sendUser(id: string, text: string): Promise<boolean> {
    const current = get(id) ?? await open(id);
    const epoch = accountEpoch;
    let conversation: Conversation;
    try {
      conversation = await command(`conversation-reply:${id}:${text.trim()}`,
        key => supportApi.replyConversation(current, text, key), async key => {
          const result = await supportApi.commandResult(key);
          return result?.kind === "conversation" ? result.conversation : null;
        });
    } catch (cause) {
      if (mustReadBack(cause)) await reconcile(id, epoch);
      throw cause;
    }
    if (epoch === accountEpoch) replace(conversation);
    return true;
  }

  async function convertToTicket(id: string, category: TicketCategory, title: string): Promise<string> {
    const current = get(id) ?? await open(id);
    const epoch = accountEpoch;
    let result: { conversation: Conversation; ticket: { id: string } };
    try {
      result = await command(`conversation-ticket:${id}:${category}:${title.trim()}`,
        key => supportApi.convertConversationToTicket(current, category, title, key), async key => {
          const commandResult = await supportApi.commandResult(key);
          return commandResult?.kind === "conversation-ticket"
            ? { conversation: commandResult.conversation, ticket: commandResult.ticket }
            : null;
        });
    } catch (cause) {
      if (mustReadBack(cause)) await reconcile(id, epoch);
      throw cause;
    }
    if (epoch === accountEpoch) replace(result.conversation);
    return result.ticket.id;
  }

  function reset() {
    accountEpoch += 1; conversations.value = []; error.value = null; typingIds.value = {};
    openGeneration.clear(); listRequestGeneration += 1;
    inFlight = new Map(); mutating.value = false;
    pendingKeys = new Map();
  }

  function bindAccount(accountKey: string) {
    reset();
    accountKeyValue = accountKey;
    pendingRunId = remoteApiEnabled ? "unverified" : "mock";
    // 启动预热是 fire-and-forget:权威不可达自吞(resilience 门)。pendingRunId 留
    // "unverified",首次 refresh() 重走 preparePendingRun 并把失败落 error 态;
    // preparePendingRun 本身保持 reject 契约(refresh/reconcile 的 await 消费方靠它报错)。
    if (remoteApiEnabled) void preparePendingRun().then(reconcilePending).catch(() => undefined);
  }

  return { conversations, typingIds, totalUnread, loading, mutating, error, refresh, byType, get, open, startConversation, startSupportSession, sendUser, convertToTicket, reset, bindAccount };
});
