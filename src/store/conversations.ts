import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { supportApi } from "@/api/runtime";
import { apiClient,apiRuntimeConfig } from "@/api/runtime";
import { ConversationRealtime } from '@/api/conversation-realtime';
import { createUniRealtimeSocket,setAppConversationRealtime } from '@/api/app-conversation-realtime';
import { catchUpConversation,mergeConversationMessages } from '@/api/conversation-history';
import { remoteApiEnabled } from "@/api/runtime";
import { asApiError } from "@/api/errors";
import { isTicketReplyRequired } from '@/api/support-ticket-policy';
import { isSupportAttachmentNotReady, type ConversationDismissal, type CurrentAdvisor } from "@/api/support-api";
import type { Conversation, ConversationCategoryAvailability, ConversationType, TicketCategory } from "@/domain/support";
import { opaqueSupportIntentSlot } from "@/lib/support-intent-slot";
import { restoreSupportPending, persistSupportPending, clearSupportPending } from "@/lib/support-pending-storage";

function mutationKey(scope: string): string {
  const label = scope.split(":", 1)[0].replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "command";
  return `support-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
const restorePending = (accountKey: string, runId: string) => restoreSupportPending(accountKey, runId, "conversations");
const persistPending = (accountKey: string, runId: string, values: Map<string, string>) => persistSupportPending(accountKey, runId, "conversations", values);
type CommandScope = { accountKey: string; epoch: number; runId: string; pending: Map<string, string>; inFlight: Map<string, Promise<unknown>> };
type SnapshotScope = { accountKey: string; epoch: number; runId: string };
type AccountScope = Pick<SnapshotScope, "accountKey" | "epoch">;
export type CategoryRefreshOutcome = "applied" | "stale" | "failed";
export type CategoryAvailabilityStatus = "loading" | "ready" | "failed";
export type HumanComposer = {
  text: string;
  imageDraft: { filePath: string; clientUploadId: string; key: string; state: "uploading" | "ready" | "failed"; attachmentId?: string; error?: "tooLarge" | "unsupported" | "uploadFailed" | "expired"; replaceOnly?: boolean } | null;
  failedSend: { text: string; attachmentId?: string; kind: "unknown" | "failed" | "expired"; settled: boolean; retryable: boolean; attempts: number } | null;
  recoveredId?: string;
  retainDraft?: boolean;
};

const HUMAN_REAUTH_ACCOUNT = "support-human-reauth-account";

function humanOutboxStorage() {
  try {
    if (typeof plus === "undefined") return sessionStorage;
    return { getItem: (key: string) => uni.getStorageSync(key) as string,
      setItem: (key: string, value: string) => uni.setStorageSync(key, value),
      removeItem: (key: string) => uni.removeStorageSync(key) };
  } catch { return null; }
}
function humanOutboxKey(account: string) { return `support-human-outbox:${account}`; }
function removeHumanCache(key: string) {
  try { humanOutboxStorage()?.removeItem(key); }
  catch { try { humanOutboxStorage()?.setItem(key, "{}"); } catch { /* Denied storage must not keep private UI authenticated. */ } }
}
function reauthAccount(): string | null {
  try {
    const value = humanOutboxStorage()?.getItem(HUMAN_REAUTH_ACCOUNT);
    return value?.startsWith("user:") ? value : null;
  } catch { return null; }
}
function restoreHumanOutbox(account: string): Record<string, HumanComposer> {
  if (!account.startsWith("user:")) return {};
  try {
    const raw = humanOutboxStorage()?.getItem(humanOutboxKey(account));
    if (!raw) return {};
    const rows: unknown = JSON.parse(raw);
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) return {};
    const restored: Record<string, HumanComposer> = {};
    for (const [key, value] of Object.entries(rows)) {
      if (!/^(start:(advisor|support)|conversation:[A-Za-z0-9_-]{1,80})$/.test(key) || !value || typeof value !== "object") continue;
      const saved = value as { text?: unknown; failedSend?: HumanComposer["failedSend"] };
      const failed = saved.failedSend;
      const recoveredId = (value as { recoveredId?: unknown }).recoveredId;
      if (typeof recoveredId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(recoveredId) && key.startsWith("start:")) {
        restored[key] = { text: typeof saved.text === "string" ? saved.text.slice(0, 140) : "", imageDraft: null, failedSend: null, recoveredId, retainDraft: true };
        continue;
      }
      if ((value as { retainDraft?: unknown }).retainDraft === true && typeof saved.text === "string" && saved.text && !failed) {
        restored[key] = { text: saved.text.slice(0, 140), imageDraft: null, failedSend: null, retainDraft: true };
        continue;
      }
      if (!failed || failed.settled || typeof failed.text !== "string" || !["unknown", "failed", "expired"].includes(failed.kind) || typeof failed.attempts !== "number"
        || (failed.attachmentId !== undefined && typeof failed.attachmentId !== "string")) continue;
      restored[key] = { text: typeof saved.text === "string" ? saved.text.slice(0, 140) : "", imageDraft: null, failedSend: failed };
    }
    return restored;
  } catch { return {}; }
}

export const useConversations = defineStore("conversations", () => {
  const conversations = ref<Conversation[]>([]);
  const dismissedThrough = ref<Record<string, number>>({});
  const dismissingIds = ref<Record<string, boolean>>({});
  const dismissalAvailable = ref(false);
  function latestPublicMessageId(conversation: Conversation): number {
    return conversation.messages.reduce((max, message) => message.sender === "system" ? max : Math.max(max, Number(message.id) || 0), conversation.lastPublicMessageId ?? 0);
  }
  function visibleInInbox(conversation: Conversation): boolean {
    const boundary = dismissedThrough.value[conversation.id];
    return !boundary || latestPublicMessageId(conversation) > boundary;
  }
  function mergeDismissals(markers: ConversationDismissal[] | null) {
    dismissalAvailable.value = markers !== null;
    if (markers === null) return;
    for (const marker of markers) dismissedThrough.value[marker.conversationNo] = Math.max(dismissedThrough.value[marker.conversationNo] ?? 0, marker.throughMessageId);
  }
  async function dismissConversation(id: string): Promise<void> {
    const conversation = get(id);
    if (!conversation || dismissingIds.value[id]) return;
    const throughMessageId = latestPublicMessageId(conversation);
    if (!throughMessageId) throw new Error("SUPPORT_DISMISSAL_BOUNDARY_INVALID");
    const scope = snapshotScope();
    dismissingIds.value[id] = true;
    try {
      const marker = await supportApi.dismissConversation(id, throughMessageId);
      if (!snapshotIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
      mergeDismissals([marker]);
    } finally {
      if (snapshotIsCurrent(scope)) delete dismissingIds.value[id];
    }
  }
  const loading = ref(false);
  const mutating = ref(false);
  const error = ref<string | null>(null);
  const typingIds = ref<Record<string, boolean>>({});
  const onlineIds = ref<Record<string, boolean>>({});
  const realtimeReady = ref(false);
  const realtimeFallback = ref(false);
  const scopeInvalidated = ref(0);
  const advisor = ref<CurrentAdvisor | null>(null);
  const advisorLoading = ref(false);
  const advisorError = ref(false);
  let advisorRequestGeneration = 0;
  const humanComposers = ref<Record<string, HumanComposer>>({});
  let humanWritesBlocked = false;
  let suspendedHumanAccount = reauthAccount();
  const discardedHumanAccounts = new Set<string>();
  function persistHumanOutbox(required = false) {
    if (!accountKeyValue.startsWith("user:")) return;
    const rows = Object.fromEntries(Object.entries(humanComposers.value)
      .filter(([key, composer]) => (composer.failedSend && !composer.failedSend.settled) || (key.startsWith("start:") && composer.recoveredId) || (composer.retainDraft && composer.text))
      .map(([key, composer]) => [key, { text: composer.text, failedSend: composer.failedSend, recoveredId: composer.recoveredId, retainDraft: composer.retainDraft }]));
    try {
      const storage = humanOutboxStorage();
      if (Object.keys(rows).length) {
        const encoded = JSON.stringify(rows);
        storage?.setItem(humanOutboxKey(accountKeyValue), encoded);
        if (storage?.getItem(humanOutboxKey(accountKeyValue)) !== encoded) throw new Error("SUPPORT_HUMAN_OUTBOX_PERSIST_FAILED");
        discardedHumanAccounts.delete(accountKeyValue);
        // Record the owner before sending; a reload may expire before this store is bound.
        storage?.setItem(HUMAN_REAUTH_ACCOUNT, accountKeyValue);
        if (storage?.getItem(HUMAN_REAUTH_ACCOUNT) !== accountKeyValue) throw new Error("SUPPORT_HUMAN_OUTBOX_PERSIST_FAILED");
        suspendedHumanAccount = accountKeyValue;
      } else storage?.removeItem(humanOutboxKey(accountKeyValue));
    } catch {
      if (required) throw new Error("SUPPORT_HUMAN_OUTBOX_PERSIST_FAILED");
    }
  }
  function composer(key: string): HumanComposer {
    return humanComposers.value[key] ?? { text: "", imageDraft: null, failedSend: null };
  }
  function saveComposer(key: string, value: HumanComposer, required = false) {
    if (remoteApiEnabled && (humanWritesBlocked || !accountKeyValue.startsWith("user:"))) return;
    const previous = humanComposers.value[key];
    // Keep the next unsent draft after readback retires the preceding intent.
    const retainDraft = !!value.text && !!(value.retainDraft || previous?.retainDraft || (previous?.failedSend && !value.failedSend));
    humanComposers.value[key] = { ...value, retainDraft };
    if (key.startsWith("start:") && value.recoveredId && value.text) {
      humanComposers.value[`conversation:${value.recoveredId}`] = { ...value, recoveredId: undefined, retainDraft: true };
    }
    persistHumanOutbox(required);
  }
  function clearComposer(key: string) {
    if (humanWritesBlocked) return;
    delete humanComposers.value[key]; persistHumanOutbox();
  }
  function suspendForReauthentication() {
    if (!remoteApiEnabled || !accountKeyValue.startsWith("user:")) return;
    // Arm before app's epoch watch clears private UI and tries to save empty refs.
    humanWritesBlocked = true;
    suspendedHumanAccount = accountKeyValue;
    try { humanOutboxStorage()?.setItem(HUMAN_REAUTH_ACCOUNT, accountKeyValue); }
    catch { /* A denied cache write must never prevent clearing invalid authentication. */ }
  }
  function discardAccountOutbox(account: string) {
    discardedHumanAccounts.add(account);
    removeHumanCache(humanOutboxKey(account));
    clearSupportPending(account, "conversations");
  }
  function discardHumanOutbox() {
    humanWritesBlocked = true;
    const suspended = suspendedHumanAccount;
    if (accountKeyValue.startsWith("user:")) discardAccountOutbox(accountKeyValue);
    if (suspended && suspended !== accountKeyValue) discardAccountOutbox(suspended);
    removeHumanCache(HUMAN_REAUTH_ACCOUNT);
    suspendedHumanAccount = null;
    reset();
  }
  async function hasPendingHumanSend(key: string, failed: NonNullable<HumanComposer["failedSend"]>): Promise<boolean> {
    await preparePendingRun();
    const intent = key.startsWith("start:")
      ? `conversation-create:${key.slice(6)}:${failed.attachmentId ?? "text"}:${failed.text.trim()}`
      : `conversation-reply:${key.slice(13)}:${failed.attachmentId ?? "text"}:${failed.text.trim()}`;
    return pendingKeys.has(opaqueSupportIntentSlot(intent));
  }
  let realtime: ConversationRealtime | null = null;
  let watchedId: string | null = null;
  let typingExpiry: ReturnType<typeof setTimeout> | undefined;
  function startRealtime() {
    if (realtime || !remoteApiEnabled || !accountKeyValue.startsWith("user:")) return;
    const epoch = accountEpoch; let instance!: ConversationRealtime;
    const current = () => realtime === instance && epoch === accountEpoch;
    instance = new ConversationRealtime({
      url: `${apiRuntimeConfig.baseUrl.replace(/^http/, "ws").replace(/\/$/, "")}/ws/conversations`,
      ticket: () => apiClient.request({ method: "POST", path: "/api/app/support/realtime-ticket" }), socket: createUniRealtimeSocket,
      reconcile: async signal => { const active = () => current() && !signal.aborted; if (!active()) return; await refresh(active); if (active() && watchedId) { const id=watchedId; await open(id,()=>active()&&watchedId===id); } },
      state: (ready) => { if (current()) { realtimeReady.value = ready; realtimeFallback.value = !ready; } },
      presence: value => { if (!current()) return; clearTimeout(typingExpiry); if (!value) { typingIds.value={}; onlineIds.value={}; return; } onlineIds.value[value.conversationNo]=value.online; typingIds.value[value.conversationNo]=value.typing; typingExpiry=setTimeout(()=>{if(current())typingIds.value[value.conversationNo]=false;},value.expiresIn??5000); },
      scopeInvalidated: customerId => {
        if (!current() || accountKeyValue !== `user:${customerId}`) return;
        const account = accountKeyValue;
        const watched = watchedId;
        discardAccountOutbox(account);
        bindAccount(account);
        scopeInvalidated.value += 1;
        startRealtime();
        if (watched) watchRealtime(watched);
        void Promise.allSettled([refreshAdvisor(), refresh().then(() => watched ? open(watched) : undefined)]);
      },
    });
    realtime=instance; setAppConversationRealtime(instance); instance.watch(watchedId); instance.start();
  }
  function stopRealtime() { const instance=realtime; realtime=null; setAppConversationRealtime(null); clearTimeout(typingExpiry); realtimeReady.value=false; realtimeFallback.value=false; typingIds.value={}; onlineIds.value={}; instance?.stop(); }
  function watchRealtime(id: string | null) { watchedId=id; realtime?.watch(id); if (!id) { typingIds.value={}; onlineIds.value={}; } }
  function setTyping(active: boolean) { realtime?.typing(active); }
  async function refreshAdvisor(): Promise<void> {
    if (!remoteApiEnabled) return;
    const scope = { accountKey: accountKeyValue, epoch: accountEpoch };
    const requestGeneration = ++advisorRequestGeneration;
    advisorLoading.value = true;
    advisorError.value = false;
    try {
      const result = await supportApi.advisor();
      if (accountScopeIsCurrent(scope) && requestGeneration === advisorRequestGeneration) advisor.value = result;
    } catch {
      if (accountScopeIsCurrent(scope) && requestGeneration === advisorRequestGeneration) { advisor.value = null; advisorError.value = true; }
    } finally {
      if (accountScopeIsCurrent(scope) && requestGeneration === advisorRequestGeneration) advisorLoading.value = false;
    }
  }

  const categoryAvailability = ref<ConversationCategoryAvailability>(remoteApiEnabled
    ? { advisor: false, support: false, ai: false }
    : { advisor: true, support: true, ai: true });
  // M5 controls new human conversation entry. Existing human conversations
  // remain readable and replyable; Nova has its own full-capability gate.
  const categoryAvailabilityStatus = ref<CategoryAvailabilityStatus>(remoteApiEnabled ? "loading" : "ready");
  const categoryLoading = ref(remoteApiEnabled);
  const totalUnread = computed(() => conversations.value.filter(visibleInInbox).reduce((sum, row) => sum + row.unread, 0));
  let pendingKeys = new Map<string, string>();
  let inFlight = new Map<string, Promise<unknown>>();
  let accountEpoch = 0;
  let accountKeyValue = "anonymous";
  let pendingRunId = "unverified";
  const openGeneration = new Map<string, number>();
  let listRequestGeneration = 0;
  let categoryRequestGeneration = 0;

  async function preparePendingRun(): Promise<void> {
    const accountKey = accountKeyValue;
    const epoch = accountEpoch;
    const runId = await supportApi.authorityRevision();
    if (epoch !== accountEpoch || accountKey !== accountKeyValue) return;
    if (runId === pendingRunId) return;
    const restored = restorePending(accountKey, runId);
    pendingRunId = runId;
    pendingKeys = restored;
  }

  function scopeIsCurrent(scope: CommandScope): boolean {
    return scope.epoch === accountEpoch && scope.accountKey === accountKeyValue && scope.runId === pendingRunId && scope.pending === pendingKeys && scope.inFlight === inFlight;
  }

  function snapshotScope(): SnapshotScope { return { accountKey: accountKeyValue, epoch: accountEpoch, runId: pendingRunId }; }
  function snapshotIsCurrent(scope: SnapshotScope): boolean {
    return scope.epoch === accountEpoch && scope.accountKey === accountKeyValue && scope.runId === pendingRunId;
  }
  function accountScopeIsCurrent(scope: AccountScope): boolean {
    return scope.epoch === accountEpoch && scope.accountKey === accountKeyValue;
  }

  async function commandScope(): Promise<CommandScope> {
    const accountKey = accountKeyValue;
    const epoch = accountEpoch;
    const startingRunId = pendingRunId;
    const startingPending = pendingKeys;
    const startingInFlight = inFlight;
    const runId = await supportApi.authorityRevision();
    if (epoch !== accountEpoch || accountKey !== accountKeyValue || startingInFlight !== inFlight) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    if (runId !== pendingRunId) {
      if (startingRunId !== pendingRunId || startingPending !== pendingKeys) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
      const restored = restorePending(accountKey, runId);
      pendingRunId = runId;
      pendingKeys = restored;
    }
    return { accountKey, epoch, runId, pending: pendingKeys, inFlight };
  }

  function mustReadBack(cause: unknown): boolean {
    const error = asApiError(cause);
    return !isSupportAttachmentNotReady(cause)
      && !isTicketReplyRequired(cause)
      && (error.status === 409 || (error.status ?? 0) >= 500 || error.kind === "network" || error.kind === "protocol");
  }

  function completePending(scope: CommandScope, fingerprint: string): void {
    const next = new Map(scope.pending);
    next.delete(fingerprint);
    persistPending(scope.accountKey, scope.runId, next);
    scope.pending.delete(fingerprint);
  }

  async function command<T>(intent: string, action: (key: string) => Promise<T>, recover?: (key: string) => Promise<T | null>, expectedAccount?: AccountScope): Promise<T> {
    const scope = await commandScope();
    if (expectedAccount && (expectedAccount.epoch !== scope.epoch || expectedAccount.accountKey !== scope.accountKey)) {
      throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    }
    const fingerprint = opaqueSupportIntentSlot(intent);
    if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    const running = scope.inFlight.get(fingerprint) as Promise<T> | undefined;
    if (running) return running;
    const key = scope.pending.get(fingerprint) ?? mutationKey(intent);
    scope.pending.set(fingerprint, key);
    persistPending(scope.accountKey, scope.runId, scope.pending);
    if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    // Every caller shares the authoritative outcome, including recovery. Start
    // after installing the promise so even a synchronous failure is single-flight.
    const promise = Promise.resolve().then(async () => {
      try {
        if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
        const result = await action(key);
        if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
        completePending(scope, fingerprint);
        return result;
      } catch (cause) {
        if (recover && mustReadBack(cause) && scopeIsCurrent(scope)) {
          const adopted = await recover(key);
          if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
          if (adopted !== null) {
            completePending(scope, fingerprint);
            return adopted;
          }
        }
        if (!mustReadBack(cause) && scopeIsCurrent(scope)) completePending(scope, fingerprint);
        throw cause;
      } finally {
        scope.inFlight.delete(fingerprint);
        if (scopeIsCurrent(scope)) mutating.value = scope.inFlight.size > 0;
      }
    });
    scope.inFlight.set(fingerprint, promise);
    if (scopeIsCurrent(scope)) mutating.value = true;
    return promise;
  }

  function replace(conversation: Conversation) {
    const prior = conversations.value.find((row) => row.id === conversation.id);
    if (prior && (conversation.version < prior.version || (conversation.version === prior.version && conversation.lastTs < prior.lastTs))) return;
    const rest = conversations.value.filter((row) => row.id !== conversation.id);
    conversations.value = [mergeConversationMessages(prior,conversation), ...rest].sort((a, b) => b.lastTs - a.lastTs);
  }

  /** A delayed page may add an absent row, but cannot erase or regress a newer live snapshot. */
  function mergeConversations(items: Conversation[]) { for (const conversation of items) replace(conversation); }

  async function refresh(active:()=>boolean=()=>true): Promise<void> {
    const epoch = accountEpoch;
    const requestGeneration = ++listRequestGeneration;
    loading.value = true;
    error.value = null;
    try {
      await preparePendingRun();
      const scope = snapshotScope();
      if (scope.epoch !== epoch || requestGeneration !== listRequestGeneration || !active()) return;
      await reconcilePending();
      if (!snapshotIsCurrent(scope) || requestGeneration !== listRequestGeneration || !active()) return;
      const [page, dismissals] = await Promise.all([supportApi.conversations(), supportApi.conversationDismissals()]);
      if (snapshotIsCurrent(scope) && requestGeneration === listRequestGeneration && active()) {
        mergeConversations(page.items); mergeDismissals(dismissals);
      }
    } catch (cause) {
      if (epoch === accountEpoch && requestGeneration === listRequestGeneration && active()) {
        error.value = cause instanceof Error ? cause.message : "SUPPORT_CONVERSATIONS_LOAD_FAILED";
      }
      throw cause;
    } finally {
      if (epoch === accountEpoch && requestGeneration === listRequestGeneration) loading.value = false;
    }
  }

  async function refreshCategories(active: () => boolean = () => true): Promise<CategoryRefreshOutcome> {
    if (!remoteApiEnabled) return "applied";
    const account = { epoch: accountEpoch, accountKey: accountKeyValue };
    const requestGeneration = ++categoryRequestGeneration;
    categoryLoading.value = true;
    try {
      const next = await supportApi.conversationCategories();
      if (!accountScopeIsCurrent(account) || requestGeneration !== categoryRequestGeneration || !active()) return "stale";
      categoryAvailability.value = next;
      categoryAvailabilityStatus.value = "ready";
      return "applied";
    } catch {
      if (!accountScopeIsCurrent(account) || requestGeneration !== categoryRequestGeneration || !active()) return "stale";
      categoryAvailabilityStatus.value = "failed";
      return "failed";
    } finally {
      if (accountScopeIsCurrent(account) && requestGeneration === categoryRequestGeneration) categoryLoading.value = false;
    }
  }

  function categoryEnabled(type: ConversationType): boolean {
    return categoryAvailabilityStatus.value === "ready" && categoryAvailability.value[type] === true;
  }

  /** Older pages may only prepend immutable messages; they never replace the live header/window. */
  function prependHistory(current: Conversation, older: Conversation): Conversation {
    const messages = [...older.messages, ...current.messages]
      .sort((left, right) => left.ts - right.ts || Number(left.id) - Number(right.id))
      .filter((message, index, all) => index === 0 || all[index - 1].id !== message.id);
    return { ...current, messages, historyTruncated: older.historyTruncated,
      historyNextCursor: older.historyNextCursor ?? null };
  }

  function byType(type: ConversationType): Conversation[] {
    return conversations.value.filter((row) => row.type === type && visibleInInbox(row)).sort((a, b) => b.lastTs - a.lastTs);
  }
  function categoryReadable(type: ConversationType): boolean {
    return categoryEnabled(type) || (type !== "ai" && conversations.value.some(row => row.type === type));
  }
  function get(id: string): Conversation | undefined { return conversations.value.find((row) => row.id === id); }

  async function open(id: string, active: () => boolean = () => true): Promise<Conversation> {
    const epoch = accountEpoch;
    const accountKey = accountKeyValue;
    const requestGeneration = (openGeneration.get(id) ?? 0) + 1;
    openGeneration.set(id, requestGeneration);
    error.value = null;
    await preparePendingRun();
    if (epoch !== accountEpoch || accountKey !== accountKeyValue || openGeneration.get(id) !== requestGeneration || !active()) {
      throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    }
    const runId = pendingRunId;
    let conversation = await supportApi.conversation(id);
    if (epoch !== accountEpoch || accountKey !== accountKeyValue || runId !== pendingRunId || openGeneration.get(id) !== requestGeneration || !active()) {
      throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    }
    const current=()=>epoch===accountEpoch&&accountKey===accountKeyValue&&runId===pendingRunId&&openGeneration.get(id)===requestGeneration&&active();
    conversation=await catchUpConversation(conversation,get(id),(no,before)=>supportApi.conversation(no,before),current);
    if(!current())throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    const lastAgent = [...conversation.messages].reverse().find(message => message.sender === "agent");
    if (conversation.unread > 0 && lastAgent) {
      try {
        const acknowledged=await supportApi.markConversationRead(conversation, Number(lastAgent.id));
        if(!current())return conversation;
        conversation = mergeConversationMessages(conversation,acknowledged);
      } catch (cause) {
        if(!current())return conversation;
        if (mustReadBack(cause)) {
          try { conversation = mergeConversationMessages(conversation,await supportApi.conversation(id)); } catch { /* retain the prior server snapshot */ }
        }
        if(!current())return conversation;
        error.value = cause instanceof Error ? cause.message : "SUPPORT_CONVERSATION_READ_FAILED";
      }
    }
    if (epoch === accountEpoch && accountKey === accountKeyValue && runId === pendingRunId && openGeneration.get(id) === requestGeneration && active()) replace(conversation);
    return conversation;
  }

  async function loadEarlier(id: string, active: () => boolean = () => true): Promise<Conversation | undefined> {
    const current = get(id);
    const beforeMessageId = current?.historyNextCursor;
    if (!current || !beforeMessageId) return current;
    const epoch = accountEpoch;
    const accountKey = accountKeyValue;
    const runId = pendingRunId;
    const requestGeneration = (openGeneration.get(id) ?? 0) + 1;
    openGeneration.set(id, requestGeneration);
    const older = await supportApi.conversation(id, beforeMessageId);
    if (epoch !== accountEpoch || accountKey !== accountKeyValue || runId !== pendingRunId
        || openGeneration.get(id) !== requestGeneration || !active()) return get(id);
    const latest = get(id);
    if (!latest) return older;
    const merged = prependHistory(latest, older);
    replace(merged);
    return merged;
  }

  async function reconcile(id: string, account: AccountScope): Promise<void> {
    if (!accountScopeIsCurrent(account)) return;
    try {
      const runId = pendingRunId;
      const requestGeneration = (openGeneration.get(id) ?? 0) + 1;
      openGeneration.set(id, requestGeneration);
      const conversation = await supportApi.conversation(id);
      if (accountScopeIsCurrent(account) && runId === pendingRunId && openGeneration.get(id) === requestGeneration) replace(conversation);
    } catch {
      // The original failure remains authoritative; reconciliation is best effort.
    }
  }

  async function reconcileAll(account: AccountScope): Promise<void> {
    if (!accountScopeIsCurrent(account)) return;
    try {
      await preparePendingRun();
      if (!accountScopeIsCurrent(account)) return;
      const scope = snapshotScope();
      const requestGeneration = ++listRequestGeneration;
      const [page, dismissals] = await Promise.all([supportApi.conversations(), supportApi.conversationDismissals()]);
      if (snapshotIsCurrent(scope) && requestGeneration === listRequestGeneration) {
        mergeConversations(page.items); mergeDismissals(dismissals);
      }
    } catch {
      // The original failure remains authoritative; reconciliation is best effort.
    }
  }

  async function reconcilePending(): Promise<void> {
    const scope: CommandScope = { accountKey: accountKeyValue, epoch: accountEpoch, runId: pendingRunId, pending: pendingKeys, inFlight };
    for (const [fingerprint, key] of [...scope.pending]) {
      if (!scopeIsCurrent(scope)) return;
      if (scope.inFlight.has(fingerprint)) continue;
      try {
        const result = await supportApi.commandResult(key);
        if (!scopeIsCurrent(scope)) return;
        if (scope.inFlight.has(fingerprint)) continue;
        if (!result) continue;
        if (scopeIsCurrent(scope) && result.kind === "conversation") replace(result.conversation);
        if (scopeIsCurrent(scope) && result.kind === "conversation-ticket") replace(result.conversation);
        if (result.kind !== "conversation" && result.kind !== "conversation-ticket") continue;
        completePending(scope, fingerprint);
        for (const [composerKey, saved] of Object.entries(humanComposers.value)) {
          const failed = saved.failedSend;
          if (!failed || failed.settled) continue;
          const intent = composerKey.startsWith("start:")
            ? `conversation-create:${composerKey.slice(6)}:${failed.attachmentId ?? "text"}:${failed.text.trim()}`
            : `conversation-reply:${composerKey.slice(13)}:${failed.attachmentId ?? "text"}:${failed.text.trim()}`;
          if (opaqueSupportIntentSlot(intent) === fingerprint)
            saveComposer(composerKey, { ...saved, failedSend: null, recoveredId: composerKey.startsWith("start:") ? result.conversation.id : undefined });
        }
      } catch { /* unknown remains durable until the authoritative readback succeeds */ }
    }
  }

  async function startConversation(type: Exclude<ConversationType, "ai">, openingText: string, attachmentId?: string): Promise<string> {
    if (remoteApiEnabled && !categoryEnabled(type)) throw new Error("SUPPORT_CATEGORY_UNAVAILABLE");
    const account = { epoch: accountEpoch, accountKey: accountKeyValue };
    let conversation: Conversation;
    try {
      conversation = await command(`conversation-create:${type}:${attachmentId ?? "text"}:${openingText.trim()}`,
        key => supportApi.startConversation(type, openingText, key, attachmentId), async key => {
          const result = await supportApi.commandResult(key);
          return result?.kind === "conversation" ? result.conversation : null;
        }, account);
    } catch (cause) {
      if (accountScopeIsCurrent(account) && mustReadBack(cause)) await reconcileAll(account);
      throw cause;
    }
    if (accountScopeIsCurrent(account)) replace(conversation);
    return conversation.id;
  }

  async function startSupportSession(openingText: string): Promise<string> {
    return startConversation("support", openingText);
  }

  async function sendUser(id: string, text: string, attachmentId?: string): Promise<boolean> {
    const account = { epoch: accountEpoch, accountKey: accountKeyValue };
    const current = get(id) ?? await open(id);
    if (!accountScopeIsCurrent(account)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    const epoch = accountEpoch;
    let conversation: Conversation;
    try {
      conversation = await command(`conversation-reply:${id}:${attachmentId ?? "text"}:${text.trim()}`,
        key => supportApi.replyConversation(current, text, key, attachmentId), async key => {
          const result = await supportApi.commandResult(key);
          return result?.kind === "conversation" ? result.conversation : null;
        }, account);
    } catch (cause) {
      if (accountScopeIsCurrent(account) && mustReadBack(cause)) await reconcile(id, account);
      throw cause;
    }
    if (epoch === accountEpoch) replace(conversation);
    return true;
  }

  async function convertToTicket(id: string, category: TicketCategory, title: string): Promise<string> {
    const account = { epoch: accountEpoch, accountKey: accountKeyValue };
    const current = get(id) ?? await open(id);
    if (!accountScopeIsCurrent(account)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    const epoch = accountEpoch;
    let result: { conversation: Conversation; ticket: { id: string } };
    try {
      result = await command(`conversation-ticket:${id}:${category}:${title.trim()}`,
        key => supportApi.convertConversationToTicket(current, category, title, key), async key => {
          const commandResult = await supportApi.commandResult(key);
          return commandResult?.kind === "conversation-ticket"
            ? { conversation: commandResult.conversation, ticket: commandResult.ticket }
            : null;
        }, account);
    } catch (cause) {
      if (accountScopeIsCurrent(account) && mustReadBack(cause)) await reconcile(id, account);
      throw cause;
    }
    if (epoch === accountEpoch) replace(result.conversation);
    return result.ticket.id;
  }

  function reset() {
    stopRealtime();watchedId=null;
    advisorRequestGeneration += 1;
    accountEpoch += 1; conversations.value = []; error.value = null; loading.value = false; typingIds.value = {};
    advisor.value = null; advisorLoading.value = false; advisorError.value = false;
    humanComposers.value = {};
    dismissedThrough.value = {}; dismissingIds.value = {};
    dismissalAvailable.value = false;
    openGeneration.clear(); listRequestGeneration += 1; categoryRequestGeneration += 1;
    inFlight = new Map(); mutating.value = false;
    pendingKeys = new Map();
    categoryAvailability.value = remoteApiEnabled
      ? { advisor: false, support: false, ai: false }
      : { advisor: true, support: true, ai: true };
    categoryAvailabilityStatus.value = remoteApiEnabled ? "loading" : "ready";
    categoryLoading.value = remoteApiEnabled;
  }

  function bindAccount(accountKey: string) {
    const suspended = suspendedHumanAccount;
    if (accountKeyValue !== accountKey && accountKeyValue.startsWith("user:") && suspended !== accountKeyValue)
      discardAccountOutbox(accountKeyValue);
    if (accountKey.startsWith("user:") && suspended && suspended !== accountKey) {
      discardAccountOutbox(suspended);
      removeHumanCache(HUMAN_REAUTH_ACCOUNT);
      suspendedHumanAccount = null;
    }
    reset();
    accountKeyValue = accountKey;
    humanWritesBlocked = false;
    humanComposers.value = discardedHumanAccounts.has(accountKey) ? {} : restoreHumanOutbox(accountKey);
    pendingRunId = remoteApiEnabled ? "unverified" : "mock";
    // 启动预热是 fire-and-forget:权威不可达自吞(resilience 门)。pendingRunId 留
    // "unverified",首次 refresh() 重走 preparePendingRun 并把失败落 error 态;
    // preparePendingRun 本身保持 reject 契约(refresh/reconcile 的 await 消费方靠它报错)。
    if (remoteApiEnabled) void preparePendingRun().then(reconcilePending).catch(() => undefined);
  }

  return { conversations, dismissConversation, dismissingIds, dismissalAvailable, typingIds, onlineIds,realtimeReady,realtimeFallback,scopeInvalidated,advisor,advisorLoading,advisorError,humanComposers,composer,saveComposer,clearComposer,suspendForReauthentication,discardHumanOutbox,hasPendingHumanSend,refreshAdvisor,startRealtime,stopRealtime,watchRealtime,setTyping, categoryAvailability, categoryAvailabilityStatus, categoryLoading, totalUnread, loading, mutating, error, refresh, refreshCategories, categoryEnabled, categoryReadable, byType, get, open, loadEarlier, startConversation, startSupportSession, sendUser, convertToTicket, reset, bindAccount };
});
