import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";
import { notificationCategory, type NotificationCategory } from "@/lib/notification-category";
import { notificationApi, remoteApiEnabled } from "@/api/runtime";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { nexGridBrandText } from "@/lib/brand-copy";

export type NotifKind = "commission" | "team" | "staking" | "market" | "genesis" | "system";
export type NotifPriority = "critical" | "high" | "normal" | "low";
export interface Notification {
  id: string;
  kind: NotifKind;
  /** Original server kind; preference keys retain their existing six-key contract. */
  rawKind?: string;
  priority: NotifPriority;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  ts: number;
  readAt: number | null;
}
export interface PushInput { id?: string; kind: NotifKind; priority?: NotifPriority; title: string; body?: string; ctaLabel?: string; ctaHref?: string; }

const KEY = "nexgrid-notifications-accounts-v1";
const knownKind = (value: string): NotifKind => ["commission", "team", "staking", "market", "genesis", "system"].includes(value) ? value as NotifKind : "system";
function hydrate(accountKey: string): Notification[] {
  const rows = readAccountRow<{ items?: Notification[] }>(KEY, accountKey)?.items ?? [];
  // 存量行可能是改名(2026-07-22)之前落盘的旧品牌标题,读侧一并归一。
  return rows.map((row) => ({ ...row, title: nexGridBrandText(row.title), body: row.body ? nexGridBrandText(row.body) : row.body }));
}
let counter = 0;

export const useNotifications = defineStore("notifications", () => {
  let boundKey = "default";
  const remoteAccountEpoch = createRemoteAccountEpoch(boundKey);
  const items = ref<Notification[]>(remoteApiEnabled ? [] : hydrate(boundKey));
  const unread = ref(items.value.filter((item) => !item.readAt).length);
  const unreadByKind = ref<Record<string, number> | null>(null);
  const unreadByCategoryExact = computed(() => !remoteApiEnabled || unread.value === 0 || unreadByKind.value !== null);
  // Without a server summary, positive counts describe only the loaded rows and
  // may power unread dots; they must not be presented as exact category totals.
  const unreadByCategory = computed<Record<NotificationCategory, number>>(() => {
    const counts = { finance: 0, device: 0, team: 0, rewards: 0, system: 0 };
    if (unread.value === 0) return counts;
    if (remoteApiEnabled && unreadByKind.value !== null) {
      for (const [rawKind, count] of Object.entries(unreadByKind.value)) {
        counts[notificationCategory({ kind: knownKind(rawKind), rawKind })] += count;
      }
    } else {
      for (const item of items.value) {
        if (item.readAt === null) counts[notificationCategory(item)] += 1;
      }
    }
    return counts;
  });
  const loading = ref(false);
  const error = ref<string | null>(null);
  const nextCursor = ref<string | null>(null);
  let historyLoaded = false;
  let refreshGeneration = 0;
  let cancelGeneration = 0;
  let mutations = { pending: 0, tail: Promise.resolve() };

  function persist() {
    if (remoteApiEnabled) return;
    // Client simulations and local timers are retained only for explicit mock mode.
    writeAccountRow(KEY, boundKey, { items: items.value });
  }
  function recount() { unread.value = items.value.filter((item) => !item.readAt).length; }
  function appendRemote(page: Awaited<ReturnType<typeof notificationApi.page>>, head: boolean) {
    const next = page.items.map((item) => {
      return {
        id: String(item.id), kind: knownKind(item.kind), rawKind: item.kind, priority: item.priority, title: item.title,
        body: item.body || undefined, ctaLabel: item.ctaLabel || undefined, ctaHref: item.ctaHref || undefined,
        ts: item.createdAt, readAt: item.readAt,
      };
    });
    const ids = new Set(next.map(item => item.id));
    const overlaps = items.value.some(item => ids.has(item.id));
    if (head) {
      items.value = page.nextCursor && historyLoaded
        ? [...next, ...items.value.filter(item => !ids.has(item.id))]
        : next;
    } else {
      const rows = new Map(next.map(item => [item.id, item]));
      const existing = new Set(items.value.map(item => item.id));
      // A refreshed head can be separated from loaded history by an offline gap.
      // Match the server's descending ID order while those pages are filled.
      items.value = [...items.value.map(item => rows.get(item.id) ?? item), ...next.filter(item => !existing.has(item.id))]
        .sort((a, b) => Number(b.id) - Number(a.id));
      historyLoaded = true;
    }
    unread.value = page.unread;
    unreadByKind.value = page.unreadByKind ? { ...page.unreadByKind } : null;
    if (!head || !historyLoaded || !page.nextCursor || !overlaps) nextCursor.value = page.nextCursor;
  }
  async function refreshRemote(request: RemoteAccountRequest = remoteAccountEpoch.snapshot(), active: () => boolean = () => true) {
    if (!remoteApiEnabled) return;
    const cancellation = cancelGeneration;
    const stillActive = () => cancellation === cancelGeneration && active();
    if (!remoteAccountEpoch.isCurrent(request)) return;
    while (mutations.pending > 0) {
      await mutations.tail;
      if (!remoteAccountEpoch.isCurrent(request) || !stillActive()) return;
    }
    if (!stillActive()) return;
    const generation = ++refreshGeneration;
    const isCurrent = () => generation === refreshGeneration && remoteAccountEpoch.isCurrent(request) && stillActive();
    loading.value = true;
    error.value = null;
    try {
      const page = await notificationApi.page();
      if (!isCurrent()) return;
      appendRemote(page, true);
    } catch (cause) {
      if (!isCurrent()) return;
      error.value = cause instanceof Error ? cause.message : "NOTIFICATION_UNAVAILABLE";
    } finally {
      if (generation === refreshGeneration && remoteAccountEpoch.isCurrent(request)) loading.value = false;
    }
  }
  async function loadMoreRemote() {
    if (!remoteApiEnabled || !nextCursor.value || loading.value) return;
    const cancellation = cancelGeneration;
    const request = remoteAccountEpoch.snapshot();
    while (mutations.pending > 0) {
      await mutations.tail;
      if (!remoteAccountEpoch.isCurrent(request) || cancellation !== cancelGeneration) return;
    }
    if (!nextCursor.value || loading.value) return;
    const requestedCursor = nextCursor.value;
    const generation = ++refreshGeneration;
    const isCurrent = () => generation === refreshGeneration && remoteAccountEpoch.isCurrent(request);
    loading.value = true;
    error.value = null;
    try {
      const page = await notificationApi.page(requestedCursor);
      if (!isCurrent()) return;
      if (page.nextCursor === requestedCursor) {
        nextCursor.value = null;
        error.value = "NOTIFICATION_PAGE_CURSOR_OVERLAP";
        return;
      }
      appendRemote(page, false);
    }
    catch (cause) {
      if (isCurrent()) error.value = cause instanceof Error ? cause.message : "NOTIFICATION_UNAVAILABLE";
    }
    finally {
      if (isCurrent()) loading.value = false;
    }
  }
  async function retryRemote() { await refreshRemote(); }
  function cancelRefresh() {
    cancelGeneration += 1;
    refreshGeneration += 1;
    loading.value = false;
  }
  function enqueueRemoteMutation<T>(request: RemoteAccountRequest, operation: () => Promise<T>): Promise<T | undefined> {
    const queue = mutations;
    queue.pending += 1;
    // The queued command represents a newer intent than any read already in flight.
    // Later reads wait for the queue; earlier reads lose ownership immediately.
    refreshGeneration += 1;
    loading.value = false;
    const queued = queue.tail.then(async () => {
      if (!remoteAccountEpoch.isCurrent(request)) return undefined;
      return operation();
    });
    const settled = queued.finally(() => { queue.pending -= 1; });
    queue.tail = settled.then(() => undefined, () => undefined);
    return settled;
  }
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    remoteAccountEpoch.bind(boundKey);
    cancelGeneration += 1;
    refreshGeneration += 1;
    mutations = { pending: 0, tail: Promise.resolve() };
    unreadByKind.value = null;
    if (remoteApiEnabled) {
      items.value = [];
      unread.value = 0;
      nextCursor.value = null;
      historyLoaded = false;
      loading.value = false;
      error.value = null;
      if (boundKey !== "default") void refreshRemote(remoteAccountEpoch.snapshot());
      return;
    }
    items.value = hydrate(boundKey); recount();
  }
  function push(input: PushInput) {
    if (remoteApiEnabled) return;
    const id = input.id ?? `n${++counter}-${Date.now().toString(36)}`;
    if (items.value.some((item) => item.id === id)) return;
    items.value = [{ id, kind: input.kind, priority: input.priority ?? "normal", title: input.title, body: input.body, ctaLabel: input.ctaLabel, ctaHref: input.ctaHref, ts: Date.now(), readAt: null }, ...items.value];
    recount(); persist();
  }
  function confirmRead(id: string) {
    const item = items.value.find(value => value.id === id);
    if (!item || item.readAt !== null) return;
    items.value = items.value.map(value => value.id === id ? { ...value, readAt: Date.now() } : value);
    // A successful acknowledgement may be an idempotent replay after another
    // device read this row. Never subtract from an authoritative group locally.
    if (unreadByKind.value !== null) return;
    unread.value = Math.max(0, unread.value - 1);
  }
  async function reconcileConfirmedRead(id: string, request: RemoteAccountRequest) {
    const hasSummary = unreadByKind.value !== null;
    confirmRead(id);
    if (!hasSummary) return;
    try {
      // Already inside the mutation queue; refreshRemote would wait on itself.
      const page = await notificationApi.page();
      if (!remoteAccountEpoch.isCurrent(request)) return;
      unread.value = page.unread;
      unreadByKind.value = page.unreadByKind ? { ...page.unreadByKind } : null;
    } catch (cause) {
      if (remoteAccountEpoch.isCurrent(request)) error.value = cause instanceof Error ? cause.message : 'NOTIFICATION_UPDATE_FAILED';
    }
  }
  async function markRead(id: string, request: RemoteAccountRequest = remoteAccountEpoch.snapshot()) {
    if (remoteApiEnabled) {
      return enqueueRemoteMutation(request, async () => {
        const item = items.value.find((value) => value.id === id);
        if (!item || item.readAt) return;
        try {
          await notificationApi.markRead(Number(id));
        } catch (cause) {
          if (!remoteAccountEpoch.isCurrent(request)) return;
          error.value = cause instanceof Error ? cause.message : "NOTIFICATION_UPDATE_FAILED";
          return false;
        }
        if (!remoteAccountEpoch.isCurrent(request)) return;
        error.value = null;
        await reconcileConfirmedRead(id, request);
      });
    }
    const item = items.value.find((value) => value.id === id);
    if (!item || item.readAt || !remoteAccountEpoch.isCurrent(request)) return;
    items.value = items.value.map((value) => value.id === id ? { ...value, readAt: Date.now() } : value); recount(); persist();
  }
  async function markAllRead() {
    const request = remoteAccountEpoch.snapshot();
    const cancellation = cancelGeneration;
    if (remoteApiEnabled) {
      const changed = await enqueueRemoteMutation(request, async () => {
        try {
          await notificationApi.markAllRead();
        } catch (cause) {
          if (!remoteAccountEpoch.isCurrent(request)) return;
          error.value = cause instanceof Error ? cause.message : "NOTIFICATION_UPDATE_FAILED";
          return false;
        }
        if (!remoteAccountEpoch.isCurrent(request)) return;
        error.value = null;
        items.value = items.value.map((item) => item.readAt ? item : { ...item, readAt: Date.now() });
        unread.value = 0;
        unreadByKind.value = {};
        return true;
      });
      // Reconcile only after leaving the queue: refresh waits for queued writes.
      if (changed && remoteAccountEpoch.isCurrent(request) && cancellation === cancelGeneration) {
        await refreshRemote(request, () => cancellation === cancelGeneration);
      }
      return changed;
    }
    items.value = items.value.map((item) => item.readAt ? item : { ...item, readAt: Date.now() }); recount(); persist();
  }
  async function clearRead() {
    const request = remoteAccountEpoch.snapshot();
    const cancellation = cancelGeneration;
    if (remoteApiEnabled) {
      const changed = await enqueueRemoteMutation(request, async () => {
        try {
          await notificationApi.clearRead();
        } catch (cause) {
          if (!remoteAccountEpoch.isCurrent(request)) return;
          error.value = cause instanceof Error ? cause.message : "NOTIFICATION_UPDATE_FAILED";
          return false;
        }
        if (!remoteAccountEpoch.isCurrent(request)) return;
        error.value = null;
        // Deletion eligibility belongs to the server (critical/locked rows may remain).
        return true;
      });
      if (changed && remoteAccountEpoch.isCurrent(request) && cancellation === cancelGeneration) {
        historyLoaded = false;
        await refreshRemote(request, () => cancellation === cancelGeneration);
      }
      return changed;
    }
    items.value = items.value.filter((item) => !item.readAt); recount(); persist();
  }
  async function recordRemoteAction(id: string, action: "cta" | "swipe_conversion"): Promise<string | null> {
    if (!remoteApiEnabled) return null;
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) return null;
    const request = remoteAccountEpoch.snapshot();
    const cancellation = cancelGeneration;
    type ActionResult =
      | { kind: "done"; route: string | null }
      | { kind: "uncertain"; cause: unknown };
    const queued = await enqueueRemoteMutation(request, async (): Promise<ActionResult> => {
      try {
        const result = await notificationApi.recordAction(numericId, action, `notification-${action}-${numericId}`);
        if (!remoteAccountEpoch.isCurrent(request)) return { kind: "done", route: null };
        try {
          await notificationApi.markRead(numericId);
        } catch (cause) {
          if (remoteAccountEpoch.isCurrent(request)) {
            error.value = cause instanceof Error ? cause.message : "NOTIFICATION_UPDATE_FAILED";
          }
          // The primary action is already confirmed. Keep its route even when the
          // secondary read acknowledgement needs a later retry.
          return { kind: "done", route: remoteAccountEpoch.isCurrent(request) ? result.route : null };
        }
        if (!remoteAccountEpoch.isCurrent(request)) return { kind: "done", route: null };
        error.value = null;
        await reconcileConfirmedRead(id, request);
        return { kind: "done", route: result.route };
      } catch (cause) {
        return { kind: "uncertain", cause };
      }
    });
    if (!queued || !remoteAccountEpoch.isCurrent(request)) return null;
    if (queued.kind === "uncertain") {
      if (cancellation !== cancelGeneration) return null;
      await refreshRemote(request, () => cancellation === cancelGeneration);
      if (!remoteAccountEpoch.isCurrent(request)) return null;
      error.value = queued.cause instanceof Error ? queued.cause.message : "NOTIFICATION_ACTION_UNCERTAIN";
      return null;
    }
    return queued.route;
  }
  async function recordCta(id: string) { return recordRemoteAction(id, "cta"); }
  async function recordSwipeConversion(id: string) { return recordRemoteAction(id, "swipe_conversion"); }
  function clearAll() { if (remoteApiEnabled) { void refreshRemote(); return; } items.value = []; recount(); persist(); }
  function removeOne(id: string) { if (remoteApiEnabled) return; items.value = items.value.filter((item) => item.id !== id); recount(); persist(); }
  return { items, unread, unreadByKind, unreadByCategory, unreadByCategoryExact, loading, error, nextCursor, push, markRead, markAllRead, clearRead, clearAll, removeOne, bindAccount, refreshRemote, cancelRefresh, loadMoreRemote, retryRemote, recordCta, recordSwipeConversion };
});
