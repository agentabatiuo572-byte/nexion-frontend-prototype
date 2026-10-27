import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { supportApi } from "@/api/runtime";
import { apiClient,apiRuntimeConfig } from "@/api/runtime";
import { ConversationRealtime } from '@/api/conversation-realtime';
import { createUniRealtimeSocket,setAppConversationRealtime } from '@/api/app-conversation-realtime';
import { catchUpConversation,mergeConversationMessages } from '@/api/conversation-history';
import { conversationPeerKey, groupConversationThreads, type ConversationThread } from '@/api/conversation-threads';
import type { ConversationUserClear } from '@/api/conversation-management';
import { remoteApiEnabled } from "@/api/runtime";
import { asApiError } from "@/api/errors";
import { awaitMessageOutcome, isConversationDeliveryAmbiguous, MESSAGE_ACK_TIMEOUT_MS, MESSAGE_READBACK_TIMEOUT_MS } from '@/lib/conversation-delivery-policy';
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
  /** Visibility boundary already observed when this draft/unknown was saved. */
  userClearThrough?: number;
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
      const saved = value as { text?: unknown; failedSend?: HumanComposer["failedSend"]; userClearThrough?: number };
      const clearVersion = Number.isSafeInteger(saved.userClearThrough) && saved.userClearThrough! >= 0
        ? { userClearThrough: saved.userClearThrough } : {};
      const failed = saved.failedSend;
      const recoveredId = (value as { recoveredId?: unknown }).recoveredId;
      if (typeof recoveredId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(recoveredId) && key.startsWith("start:")) {
        restored[key] = { ...clearVersion, text: typeof saved.text === "string" ? saved.text.slice(0, 140) : "", imageDraft: null, failedSend: null, recoveredId, retainDraft: true };
        continue;
      }
      if ((value as { retainDraft?: unknown }).retainDraft === true && typeof saved.text === "string" && saved.text && !failed) {
        restored[key] = { ...clearVersion, text: saved.text.slice(0, 140), imageDraft: null, failedSend: null, retainDraft: true };
        continue;
      }
      if (!failed || failed.settled || typeof failed.text !== "string" || !["unknown", "failed", "expired"].includes(failed.kind) || typeof failed.attempts !== "number"
        || (failed.attachmentId !== undefined && typeof failed.attachmentId !== "string")) continue;
      restored[key] = { ...clearVersion, text: typeof saved.text === "string" ? saved.text.slice(0, 140) : "", imageDraft: null, failedSend: failed };
    }
    return restored;
  } catch { return {}; }
}

export const useConversations = defineStore("conversations", () => {
  const conversations = ref<Conversation[]>([]);
  const dismissedThrough = ref<Record<string, number>>({});
  const dismissingIds = ref<Record<string, boolean>>({});
  const dismissalAvailable = ref(false);
  const deletionAvailable = ref(false), deletingIds = ref<Record<string, boolean>>({});
  const clearedThrough = new Map<string, number>();
  const humanThreads = computed(() => groupConversationThreads(conversations.value)
    .filter(thread => thread.conversationIds.some(id => visibleInInbox(get(id)!))));
  function getThread(id: string): ConversationThread | undefined {
    return groupConversationThreads(conversations.value).find(thread => thread.conversationIds.includes(id));
  }
  async function openThread(id: string, active: () => boolean = () => true): Promise<ConversationThread | undefined> {
    const missing = !get(id);
    if (missing) await open(id, active);
    const members = getThread(id)?.conversationIds ?? [];
    for (const member of members) {
      if (!active()) return getThread(id);
      if (!missing || member !== id) await open(member, active);
    }
    return getThread(id);
  }
  async function loadEarlierThread(id: string, active: () => boolean = () => true): Promise<ConversationThread | undefined> {
    const members = getThread(id)?.conversationIds ?? [];
    const earlier = members.map(member => get(member)!).filter(row => row.historyNextCursor)
      .sort((a, b) => b.historyNextCursor! - a.historyNextCursor!)[0];
    if (earlier) await loadEarlier(earlier.id, active);
    return getThread(id);
  }
  async function deleteConversation(id: string): Promise<void> {
    if (!deletionAvailable.value) throw new Error('SUPPORT_HISTORY_DELETION_UNAVAILABLE');
    const thread = getThread(id);
    if (!thread || deletingIds.value[id]) return;
    const account = { accountKey: accountKeyValue, epoch: accountEpoch };
    const members = thread.conversationIds.map(member => get(member)!);
    for (const member of members) deletingIds.value[member.id] = true;
    try {
      const result = await command(`conversation-user-clear:${thread.peerKey}:${[...thread.conversationIds].sort().join(',')}`,
        key => supportApi.deleteConversation(thread.id, thread.peerKey, members, key), async key => {
          const receipt = await supportApi.commandResult(key);
          return receipt?.kind === 'conversation-user-clear' && receipt.clearance.peerKey === thread.peerKey
            && thread.conversationIds.every(id => receipt.clearance.conversationNos.includes(id))
            ? receipt.clearance : null;
        }, account);
      if (!accountScopeIsCurrent(account)) throw new Error('SUPPORT_ACCOUNT_SCOPE_CHANGED');
      applyUserClear(result);
    } finally {
      if (accountScopeIsCurrent(account)) for (const member of members) delete deletingIds.value[member.id];
    }
  }
  function userVisibleSnapshot(row: Conversation): Conversation | undefined {
    const boundary = Math.max(clearedThrough.get(conversationPeerKey(row)) ?? -1, clearedThrough.get(`conversation:${row.id}`) ?? -1);
    if (boundary < 0) return row;
    if (latestPublicMessageId(row) <= boundary) return undefined;
    const cursor = row.historyNextCursor != null && row.historyNextCursor > boundary ? row.historyNextCursor : null;
    return { ...row, userClearedThroughMessageId: boundary,
      messages: row.messages.filter(message => Number(message.id) > boundary),
      historyNextCursor: cursor, historyTruncated: cursor !== null && row.historyTruncated };
  }
  function applyUserClear(result: ConversationUserClear) {
    const previous = clearedThrough.get(result.peerKey) ?? -1;
    for (const id of result.conversationNos) clearedThrough.set(`conversation:${id}`,
      Math.max(clearedThrough.get(`conversation:${id}`) ?? -1, result.throughMessageId));
    if (previous >= result.throughMessageId) return;
    clearedThrough.set(result.peerKey, result.throughMessageId);
    const members = new Set([...result.conversationNos,
      ...conversations.value.filter(row => conversationPeerKey(row) === result.peerKey).map(row => row.id)]);
    for (const member of members) {
      openGeneration.delete(member);
      delete dismissedThrough.value[member]; delete typingIds.value[member]; delete onlineIds.value[member];
    }
    for (const [key, saved] of Object.entries(humanComposers.value)) {
      const id = key.startsWith('conversation:') ? key.slice(13) : saved.recoveredId;
      if (id && members.has(id) && (saved.userClearThrough ?? -1) < result.throughMessageId) clearComposer(key);
    }
    conversations.value = conversations.value.flatMap(row => { const visible = userVisibleSnapshot(row); return visible ? [visible] : []; });
  }
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
      .map(([key, composer]) => [key, { text: composer.text, failedSend: composer.failedSend, recoveredId: composer.recoveredId, retainDraft: composer.retainDraft, userClearThrough: composer.userClearThrough }]));
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
    const id = key.startsWith('conversation:') ? key.slice(13) : value.recoveredId;
    const row = id ? get(id) : undefined;
    const boundary = Math.max(value.userClearThrough ?? -1, id ? clearedThrough.get(`conversation:${id}`) ?? -1 : -1,
      row ? clearedThrough.get(conversationPeerKey(row)) ?? -1 : -1);
    const next = { ...value, retainDraft, ...(boundary >= 0 ? { userClearThrough: boundary } : {}) };
    humanComposers.value[key] = next;
    if (key.startsWith("start:") && value.recoveredId && value.text) {
      humanComposers.value[`conversation:${value.recoveredId}`] = { ...next, recoveredId: undefined, retainDraft: true };
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
      state: (ready, _terminal, unavailable) => { if (current()) { realtimeReady.value = ready; realtimeFallback.value = unavailable; } },
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
        void Promise.allSettled([refreshAdvisor(), refreshCategories(), refresh().then(() => watched ? open(watched) : undefined)]);
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
  const totalUnread = computed(() => humanThreads.value.reduce((sum, row) => sum + row.unread, 0)
    + conversations.value.filter(row => row.type === 'ai' && visibleInInbox(row)).reduce((sum, row) => sum + row.unread, 0));
  let pendingKeys = new Map<string, string>();
  let inFlight = new Map<string, Promise<unknown>>();
  const runningCommandKeys = new WeakMap<Promise<unknown>, string>();
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
    return !isSupportAttachmentNotReady(cause)
      && !isTicketReplyRequired(cause)
      && isConversationDeliveryAmbiguous(cause);
  }

  function completePending(scope: CommandScope, fingerprint: string): void {
    const key = scope.pending.get(fingerprint);
    const next = new Map(scope.pending);
    next.delete(fingerprint);
    persistPending(scope.accountKey, scope.runId, next);
    scope.pending.delete(fingerprint);
    if (key) {
      const storage = startTargetStorage(), targetKey = startTargetKey(scope, key);
      if (storage.getItem(targetKey)) storage.removeItem(targetKey);
    }
  }

  // A reused start sends a reply. Keep that decision with the original key across
  // reload so an unknown reply can never be retried as a new create (or vice versa).
  function startTargetStorage() {
    return typeof plus === 'undefined' ? localStorage : {
      getItem: (key: string) => uni.getStorageSync(key) as string,
      setItem: (key: string, value: string) => uni.setStorageSync(key, value),
      removeItem: (key: string) => uni.removeStorageSync(key),
    };
  }
  function startTargetKey(scope: SnapshotScope, key: string) { return `support-start-target:${scope.accountKey}:${scope.runId}:${key}`; }
  async function dispatchStart(type: 'support' | 'advisor', text: string, key: string, attachmentId: string | undefined,
      scope: CommandScope, recovering: boolean): Promise<Conversation> {
    const storage = startTargetStorage(), storageKey = startTargetKey(scope, key);
    const raw = storage.getItem(storageKey);
    let target: string | null;
    if (raw) {
      target = JSON.parse(raw);
      if (target !== null && (typeof target !== 'string' || !target.trim())) throw new Error('SUPPORT_START_TARGET_INVALID');
    } else {
      target = null;
      if (!recovering && supportApi.advisor) {
        const assignment = await supportApi.advisor();
        if (!scopeIsCurrent(scope)) throw new Error('SUPPORT_ACCOUNT_SCOPE_CHANGED');
        const peerId = assignment.currentAdvisorId === null ? null : String(assignment.currentAdvisorId);
        if (peerId) {
          const page = await supportApi.conversations();
          if (!scopeIsCurrent(scope)) throw new Error('SUPPORT_ACCOUNT_SCOPE_CHANGED');
          mergeConversations(page.items);
          target = page.items.filter(row => row.ownerAgentId === peerId && (row.status === 'open' || row.status === 'resolved'))
            .sort((a, b) => b.lastTs - a.lastTs)[0]?.id ?? null;
        }
      }
      storage.setItem(storageKey, JSON.stringify(target));
      if (storage.getItem(storageKey) !== JSON.stringify(target)) throw new Error('SUPPORT_PENDING_PERSIST_FAILED');
    }
    if (!scopeIsCurrent(scope)) throw new Error('SUPPORT_ACCOUNT_SCOPE_CHANGED');
    if (!target) return supportApi.startConversation(type, text, key, attachmentId);
    const current = await supportApi.conversation(target);
    if (!scopeIsCurrent(scope)) throw new Error('SUPPORT_ACCOUNT_SCOPE_CHANGED');
    return supportApi.replyConversation(current, text, key, attachmentId);
  }

  async function command<T>(intent: string, action: (key: string) => Promise<T>, recover?: (key: string) => Promise<T | null>, expectedAccount?: AccountScope, createPolicy?: { gate: () => boolean; recovery?: { scope: CommandScope; key: string } }, onKey?: (key: string) => void): Promise<T> {
    const scope = await commandScope();
    if (expectedAccount && (expectedAccount.epoch !== scope.epoch || expectedAccount.accountKey !== scope.accountKey)) {
      throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    }
    const fingerprint = opaqueSupportIntentSlot(intent);
    if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    // Recovery authorization is tied to the final send scope and original key.
    // A new run, retired slot or changed key must never fall through to minting.
    if (createPolicy?.recovery) {
      const original = createPolicy.recovery;
      if (!scopeIsCurrent(original.scope) || original.scope.runId !== scope.runId
          || original.scope.pending !== scope.pending || original.scope.inFlight !== scope.inFlight
          || scope.pending.get(fingerprint) !== original.key) {
        throw new Error("SUPPORT_PENDING_RECOVERY_SCOPE_CHANGED");
      }
    } else if (createPolicy && !createPolicy.gate()) {
      throw new Error("SUPPORT_CATEGORY_UNAVAILABLE");
    }
    const running = scope.inFlight.get(fingerprint) as Promise<T> | undefined;
    if (running) {
      const originalKey = runningCommandKeys.get(running);
      if (originalKey) onKey?.(originalKey);
      return running;
    }
    const key = createPolicy?.recovery?.key ?? scope.pending.get(fingerprint) ?? mutationKey(intent);
    const humanSend = intent.startsWith('conversation-create:') || intent.startsWith('conversation-reply:');
    const echoedOutcome = () => humanSend && scopeIsCurrent(scope)
      ? conversations.value.find(row => (intent.startsWith('conversation-reply:') ? row.id === intent.split(':')[1] : row.type === intent.split(':')[1])
        && row.messages.some(message => message.sender === 'user' && message.clientMessageId === key)) : undefined;
    scope.pending.set(fingerprint, key);
    persistPending(scope.accountKey, scope.runId, scope.pending);
    if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    onKey?.(key);
    // Every caller shares the authoritative outcome, including recovery. Start
    // after installing the promise so even a synchronous failure is single-flight.
    const promise = Promise.resolve().then(async () => {
      try {
        if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
        if (createPolicy?.recovery && scope.pending.get(fingerprint) !== createPolicy.recovery.key)
          throw new Error("SUPPORT_PENDING_RECOVERY_SCOPE_CHANGED");
        if (createPolicy && !createPolicy.recovery && !createPolicy.gate())
          throw new Error("SUPPORT_CATEGORY_UNAVAILABLE");
        const operation = action(key);
        const result = await (humanSend ? awaitMessageOutcome(operation, MESSAGE_ACK_TIMEOUT_MS) : operation);
        if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
        completePending(scope, fingerprint);
        return result;
      } catch (cause) {
        const echoed = echoedOutcome();
        if (echoed) { completePending(scope, fingerprint); return echoed as T; }
        if (recover && mustReadBack(cause) && scopeIsCurrent(scope)) {
          let adopted: T | null = null;
          try {
            const recovery = recover(key);
            adopted = await (humanSend ? awaitMessageOutcome(recovery, MESSAGE_READBACK_TIMEOUT_MS) : recovery);
          } catch (readbackError) {
            if (!humanSend) throw readbackError;
            // A failed read cannot turn an uncertain write into a refusal.
            // Preserve the original cause unless a canonical echo confirms it.
          }
          if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
          if (adopted === null) {
            const confirmed = echoedOutcome();
            if (confirmed) adopted = confirmed as T;
          }
          if (adopted !== null) {
            completePending(scope, fingerprint);
            return adopted;
          }
        }
        if (!mustReadBack(cause) && scopeIsCurrent(scope) && scope.pending.get(fingerprint) === key) completePending(scope, fingerprint);
        throw cause;
      } finally {
        scope.inFlight.delete(fingerprint);
        if (scopeIsCurrent(scope)) mutating.value = scope.inFlight.size > 0;
      }
    });
    runningCommandKeys.set(promise, key);
    scope.inFlight.set(fingerprint, promise);
    if (scopeIsCurrent(scope)) mutating.value = true;
    return promise;
  }

  function replace(conversation: Conversation) {
    if (conversation.userClearedThroughMessageId !== undefined) applyUserClear({ scope: 'USER_VIEW', userScopeCleared: true,
      peerKey: conversationPeerKey(conversation), throughMessageId: conversation.userClearedThroughMessageId, conversationNos: [conversation.id] });
    const visible = userVisibleSnapshot(conversation);
    if (!visible) return;
    conversation = visible;
    const prior = conversations.value.find((row) => row.id === conversation.id);
    if (prior && (conversation.version < prior.version || (conversation.version === prior.version && conversation.lastTs < prior.lastTs))) return;
    const rest = conversations.value.filter((row) => row.id !== conversation.id);
    conversations.value = [mergeConversationMessages(prior,conversation), ...rest].sort((a, b) => b.lastTs - a.lastTs);
    // A canonical echo is as conclusive as a command readback. Never correlate by body text.
    const echoed = new Set(conversation.messages.filter(m => m.sender === 'user').map(m => m.clientMessageId).filter(Boolean));
    if (!echoed.size) return;
    const scope: CommandScope = { accountKey: accountKeyValue, epoch: accountEpoch, runId: pendingRunId, pending: pendingKeys, inFlight };
    for (const [composerKey, saved] of Object.entries(humanComposers.value)) {
      const failed = saved.failedSend;
      if (!failed || failed.settled) continue;
      if (composerKey.startsWith('start:') && composerKey.slice(6) !== conversation.type) continue;
      if (!composerKey.startsWith('start:') && composerKey !== `conversation:${conversation.id}`) continue;
      const intent = composerKey.startsWith('start:')
        ? `conversation-create:${composerKey.slice(6)}:${failed.attachmentId ?? 'text'}:${failed.text.trim()}`
        : `conversation-reply:${conversation.id}:${failed.attachmentId ?? 'text'}:${failed.text.trim()}`;
      const fingerprint = opaqueSupportIntentSlot(intent), key = scope.pending.get(fingerprint);
      if (!key || !echoed.has(key)) continue;
      completePending(scope, fingerprint);
      saveComposer(composerKey, { ...saved, failedSend: null, recoveredId: composerKey.startsWith('start:') ? conversation.id : undefined });
    }
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
      deletionAvailable.value = false;
      const [page, dismissals, capability] = await Promise.all([supportApi.conversations(), supportApi.conversationDismissals(), supportApi.conversationManagement?.()]);
      if (snapshotIsCurrent(scope) && requestGeneration === listRequestGeneration && active()) {
        for (const marker of capability?.clearedPeers ?? []) applyUserClear(marker);
        mergeConversations(page.items); mergeDismissals(dismissals);
        deletionAvailable.value = capability?.clearUserHistory === true;
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
    return categoryAvailabilityStatus.value === "ready" && categoryAvailability.value[type === "support" ? "advisor" : type] === true;
  }

  /** Older pages may only prepend immutable messages; they never replace the live header/window. */
  function prependHistory(current: Conversation, older: Conversation): Conversation {
    const messages = [...older.messages, ...current.messages]
      .sort((left, right) => left.ts - right.ts || Number(left.id) - Number(right.id))
      .filter((message, index, all) => index === 0 || all[index - 1].id !== message.id);
    const clearedThrough = Math.max(current.userClearedThroughMessageId ?? -1, older.userClearedThroughMessageId ?? -1);
    return { ...current, messages, historyTruncated: older.historyTruncated,
      historyNextCursor: older.historyNextCursor ?? null,
      ...(clearedThrough >= 0 ? { userClearedThroughMessageId: clearedThrough } : {}) };
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
    return get(id);
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
    let requestGeneration: number | undefined;
    try {
      await preparePendingRun();
      if (!accountScopeIsCurrent(account)) return;
      const scope = snapshotScope();
      requestGeneration = ++listRequestGeneration;
      loading.value = true;
      error.value = null;
      const [page, dismissals] = await Promise.all([supportApi.conversations(), supportApi.conversationDismissals()]);
      if (snapshotIsCurrent(scope) && requestGeneration === listRequestGeneration) {
        mergeConversations(page.items); mergeDismissals(dismissals);
      }
    } catch (cause) {
      if (accountScopeIsCurrent(account) && requestGeneration === listRequestGeneration) {
        error.value = cause instanceof Error ? cause.message : "SUPPORT_CONVERSATIONS_LOAD_FAILED";
      }
      // The original command failure remains authoritative for its caller.
    } finally {
      if (accountScopeIsCurrent(account) && requestGeneration === listRequestGeneration) loading.value = false;
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
        if (result.kind === 'conversation-user-clear') {
          applyUserClear(result.clearance); completePending(scope, fingerprint); continue;
        }
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

  async function hasPendingHumanCreate(type: Exclude<ConversationType, "ai">, openingText: string, attachmentId?: string): Promise<boolean> {
    const account = { epoch: accountEpoch, accountKey: accountKeyValue };
    await preparePendingRun();
    if (!accountScopeIsCurrent(account)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    return pendingKeys.has(opaqueSupportIntentSlot(`conversation-create:${type}:${attachmentId ?? "text"}:${openingText.trim()}`));
  }
  async function startConversation(type: Exclude<ConversationType, "ai">, openingText: string, attachmentId?: string, onDispatch?: (key: string) => void): Promise<string> {
    const account = { epoch: accountEpoch, accountKey: accountKeyValue };
    const intent = `conversation-create:${type}:${attachmentId ?? "text"}:${openingText.trim()}`;
    const originalScope = remoteApiEnabled ? await commandScope() : undefined;
    if (!accountScopeIsCurrent(account)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    const originalKey = originalScope?.pending.get(opaqueSupportIntentSlot(intent));
    const createPolicy = { gate: () => !remoteApiEnabled || categoryEnabled(type),
      recovery: originalScope && originalKey ? { scope: originalScope, key: originalKey } : undefined };
    if (!createPolicy.recovery && !createPolicy.gate()) throw new Error("SUPPORT_CATEGORY_UNAVAILABLE");
    let conversation: Conversation;
    try {
      conversation = await command(intent,
        key => originalScope ? dispatchStart(type, openingText, key, attachmentId, originalScope, !!originalKey)
          : supportApi.startConversation(type, openingText, key, attachmentId), async key => {
          const result = await supportApi.commandResult(key);
          return result?.kind === "conversation" ? result.conversation : null;
        }, account, createPolicy, onDispatch);
    } catch (cause) {
      if (accountScopeIsCurrent(account) && mustReadBack(cause)) void reconcileAll(account);
      throw cause;
    }
    if (accountScopeIsCurrent(account)) replace(conversation);
    return conversation.id;
  }

  async function startSupportSession(openingText: string): Promise<string> {
    return startConversation("support", openingText);
  }

  async function sendUser(id: string, text: string, attachmentId?: string, onDispatch?: (key: string) => void): Promise<boolean> {
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
        }, account, undefined, onDispatch);
    } catch (cause) {
      if (accountScopeIsCurrent(account) && mustReadBack(cause)) void reconcile(id, account);
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
    clearedThrough.clear(); deletionAvailable.value = false; deletingIds.value = {};
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

  return { conversations, humanThreads, getThread, openThread, loadEarlierThread, deleteConversation, deletionAvailable, deletingIds, dismissConversation, dismissingIds, dismissalAvailable, typingIds, onlineIds,realtimeReady,realtimeFallback,scopeInvalidated,advisor,advisorLoading,advisorError,humanComposers,composer,saveComposer,clearComposer,suspendForReauthentication,discardHumanOutbox,hasPendingHumanSend,hasPendingHumanCreate,refreshAdvisor,startRealtime,stopRealtime,watchRealtime,setTyping, categoryAvailability, categoryAvailabilityStatus, categoryLoading, totalUnread, loading, mutating, error, refresh, refreshCategories, categoryEnabled, categoryReadable, byType, get, open, loadEarlier, startConversation, startSupportSession, sendUser, convertToTicket, reset, bindAccount };
});
