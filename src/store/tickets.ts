import { defineStore } from "pinia";
import { ref } from "vue";
import { supportApi } from "@/api/runtime";
import { remoteApiEnabled } from "@/api/runtime";
import { asApiError } from "@/api/errors";
import type { Ticket, TicketCategory } from "@/domain/support";
import { opaqueSupportIntentSlot } from "@/lib/support-intent-slot";
import { restoreSupportPending, persistSupportPending } from "@/lib/support-pending-storage";

function mutationKey(scope: string): string {
  const label = scope.split(":", 1)[0].replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "command";
  return `support-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
const restorePending = (accountKey: string, runId: string) => restoreSupportPending(accountKey, runId, "tickets");
const persistPending = (accountKey: string, runId: string, values: Map<string, string>) => persistSupportPending(accountKey, runId, "tickets", values);
type CommandScope = { accountKey: string; epoch: number; runId: string; pending: Map<string, string>; inFlight: Map<string, Promise<unknown>> };
type SnapshotScope = { accountKey: string; epoch: number; runId: string };

export const useTickets = defineStore("tickets", () => {
  const tickets = ref<Ticket[]>([]);
  const loading = ref(false);
  const mutating = ref(false);
  const error = ref<string | null>(null);
  let pendingKeys = new Map<string, string>();
  let inFlight = new Map<string, Promise<unknown>>();
  let accountEpoch = 0;
  let accountKeyValue = "anonymous";
  let pendingRunId = "unverified";
  let listRequestGeneration = 0;
  const ticketRequestGeneration = new Map<string, number>();

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
    return error.status === 409 || (error.status ?? 0) >= 500 || error.kind === "network" || error.kind === "protocol";
  }

  function completePending(scope: CommandScope, fingerprint: string): void {
    const next = new Map(scope.pending);
    next.delete(fingerprint);
    persistPending(scope.accountKey, scope.runId, next);
    scope.pending.delete(fingerprint);
  }

  async function command<T>(intent: string, action: (key: string) => Promise<T>, recover?: (key: string) => Promise<T | null>): Promise<T> {
    const scope = await commandScope();
    const fingerprint = opaqueSupportIntentSlot(intent);
    if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    const running = scope.inFlight.get(fingerprint) as Promise<T> | undefined;
    if (running) return running;
    const key = scope.pending.get(fingerprint) ?? mutationKey(intent);
    scope.pending.set(fingerprint, key);
    persistPending(scope.accountKey, scope.runId, scope.pending);
    if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
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
          if (adopted !== null) {
            if (!scopeIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
            completePending(scope, fingerprint);
            return adopted;
          }
        }
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

  function replace(ticket: Ticket) {
    const prior = tickets.value.find((row) => row.id === ticket.id);
    if (prior && (ticket.version < prior.version || (ticket.version === prior.version && ticket.updatedAt < prior.updatedAt))) return;
    const rest = tickets.value.filter((row) => row.id !== ticket.id);
    tickets.value = [ticket, ...rest].sort((a, b) => b.lastReplyAt - a.lastReplyAt);
  }

  /** A delayed page is allowed to fill gaps, never to erase or regress a newer local snapshot. */
  function mergeTickets(items: Ticket[]) {
    for (const ticket of items) {
      const prior = tickets.value.find(row => row.id === ticket.id);
      // List headers must not erase a detail window opened before the background refresh.
      replace(prior ? { ...ticket, messages: prior.messages,
        historyTruncated: prior.historyTruncated, historyNextCursor: prior.historyNextCursor } : ticket);
    }
  }

  /** Older pages only extend the visible timeline; a stale response cannot regress its header. */
  function prependHistory(current: Ticket, older: Ticket): Ticket {
    const messages = [...older.messages, ...current.messages]
      .sort((left, right) => left.ts - right.ts || Number(left.id) - Number(right.id))
      .filter((message, index, all) => index === 0 || all[index - 1].id !== message.id);
    return { ...current, messages, historyTruncated: older.historyTruncated,
      historyNextCursor: older.historyNextCursor ?? null };
  }

  async function refresh(active: () => boolean = () => true): Promise<void> {
    if (!active()) return;
    const epoch = accountEpoch;
    const requestGeneration = ++listRequestGeneration;
    const current = () => epoch === accountEpoch && requestGeneration === listRequestGeneration && active();
    loading.value = true;
    error.value = null;
    try {
      await preparePendingRun();
      const scope = snapshotScope();
      if (!current()) return;
      await reconcilePending(current);
      if (!snapshotIsCurrent(scope) || !current()) return;
      const items = (await supportApi.tickets()).items;
      if (snapshotIsCurrent(scope) && current()) mergeTickets(items);
    } catch (cause) {
      if (current()) {
        error.value = cause instanceof Error ? cause.message : "SUPPORT_TICKETS_LOAD_FAILED";
      }
      throw cause;
    } finally {
      if (epoch === accountEpoch && requestGeneration === listRequestGeneration) loading.value = false;
    }
  }
  function cancelRefresh() { listRequestGeneration += 1; loading.value = false; }

  async function load(id: string): Promise<Ticket> {
    const epoch = accountEpoch;
    const accountKey = accountKeyValue;
    await preparePendingRun();
    if (epoch !== accountEpoch || accountKey !== accountKeyValue) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    const scope = snapshotScope();
    const requestGeneration = (ticketRequestGeneration.get(id) ?? 0) + 1;
    ticketRequestGeneration.set(id, requestGeneration);
    const ticket = await supportApi.ticket(id);
    if (!snapshotIsCurrent(scope)) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    if (ticketRequestGeneration.get(id) !== requestGeneration) throw new Error("SUPPORT_TICKET_REQUEST_SUPERSEDED");
    replace(ticket);
    return ticket;
  }

  async function loadEarlier(id: string): Promise<Ticket | undefined> {
    const current = tickets.value.find(ticket => ticket.id === id);
    const beforeMessageId = current?.historyNextCursor;
    if (!current || !beforeMessageId) return current;
    const epoch = accountEpoch;
    const accountKey = accountKeyValue;
    await preparePendingRun();
    if (epoch !== accountEpoch || accountKey !== accountKeyValue) return tickets.value.find(ticket => ticket.id === id);
    const scope = snapshotScope();
    const requestGeneration = (ticketRequestGeneration.get(id) ?? 0) + 1;
    ticketRequestGeneration.set(id, requestGeneration);
    const older = await supportApi.ticket(id, beforeMessageId);
    if (!snapshotIsCurrent(scope) || ticketRequestGeneration.get(id) !== requestGeneration) return tickets.value.find(ticket => ticket.id === id);
    const latest = tickets.value.find(ticket => ticket.id === id);
    if (!latest) return older;
    const merged = prependHistory(latest, older);
    replace(merged);
    return merged;
  }

  async function markRead(ticket: Ticket): Promise<void> {
    if (ticket.unread === 0) return;
    const scope = snapshotScope();
    const current = tickets.value.find(row => row.id === ticket.id);
    if (!current || current.version !== ticket.version) return;
    let result: Ticket;
    try {
      result = await supportApi.markTicketRead(ticket);
    } catch (cause) {
      // Reading is a best-effort acknowledgement, but a stale header means a
      // newer agent reply may have arrived. Refresh that ticket before the page
      // decides what unread state to render; never apply the old acknowledgement.
      if (mustReadBack(cause)) await reconcile(ticket.id, scope.epoch);
      throw cause;
    }
    if (snapshotIsCurrent(scope)) replace(result);
  }

  async function reconcile(id: string, epoch: number): Promise<void> {
    try {
      const accountKey = accountKeyValue;
      await preparePendingRun();
      if (epoch !== accountEpoch || accountKey !== accountKeyValue) return;
      const scope = snapshotScope();
      const requestGeneration = (ticketRequestGeneration.get(id) ?? 0) + 1;
      ticketRequestGeneration.set(id, requestGeneration);
      const ticket = await supportApi.ticket(id);
      if (snapshotIsCurrent(scope) && ticketRequestGeneration.get(id) === requestGeneration) replace(ticket);
    } catch {
      // The original failure remains authoritative; reconciliation is best effort.
    }
  }

  async function createTicket(input: { category: TicketCategory; subject: string; body: string }): Promise<string> {
    const epoch = accountEpoch;
    const intent = `ticket-create:${input.category}:${input.subject.trim()}:${input.body.trim()}`;
    let ticket: Ticket;
    try {
      ticket = await command(intent, key => supportApi.createTicket(input, key), async key => {
        const result = await supportApi.commandResult(key);
        return result?.kind === "ticket" ? result.ticket : null;
      });
    } catch (cause) {
      if (mustReadBack(cause)) await reconcileAll(epoch);
      throw cause;
    }
    if (epoch === accountEpoch) replace(ticket);
    return ticket.id;
  }

  async function reply(id: string, body: string): Promise<boolean> {
    const current = tickets.value.find((row) => row.id === id) ?? await load(id);
    const epoch = accountEpoch;
    let ticket: Ticket;
    try {
      ticket = await command(`ticket-reply:${id}:${body.trim()}`,
        key => supportApi.replyTicket(current, body, key), async key => {
          const result = await supportApi.commandResult(key);
          return result?.kind === "ticket" ? result.ticket : null;
        });
    } catch (cause) {
      if (mustReadBack(cause)) await reconcile(id, epoch);
      throw cause;
    }
    if (epoch === accountEpoch) replace(ticket);
    return true;
  }

  async function close(id: string): Promise<boolean> {
    const current = tickets.value.find((row) => row.id === id) ?? await load(id);
    const epoch = accountEpoch;
    let ticket: Ticket;
    try {
      ticket = await command(`ticket-close:${id}`,
        key => supportApi.closeTicket(current, key), async key => {
          const result = await supportApi.commandResult(key);
          return result?.kind === "ticket" ? result.ticket : null;
        });
    } catch (cause) {
      if (mustReadBack(cause)) await reconcile(id, epoch);
      throw cause;
    }
    if (epoch === accountEpoch) replace(ticket);
    return true;
  }

  async function reconcileAll(epoch: number): Promise<void> {
    const accountKey = accountKeyValue;
    let requestGeneration: number | undefined;
    try {
      await preparePendingRun();
      if (epoch !== accountEpoch || accountKey !== accountKeyValue) return;
      const scope = snapshotScope();
      requestGeneration = ++listRequestGeneration;
      loading.value = true;
      error.value = null;
      const items = (await supportApi.tickets()).items;
      if (snapshotIsCurrent(scope) && requestGeneration === listRequestGeneration) mergeTickets(items);
    } catch (cause) {
      if (epoch === accountEpoch && accountKey === accountKeyValue && requestGeneration === listRequestGeneration) {
        error.value = cause instanceof Error ? cause.message : "SUPPORT_TICKETS_LOAD_FAILED";
      }
      // The original command failure remains authoritative for its caller.
    } finally {
      if (epoch === accountEpoch && accountKey === accountKeyValue && requestGeneration === listRequestGeneration) loading.value = false;
    }
  }

  async function reconcilePending(active: () => boolean = () => true): Promise<void> {
    const scope: CommandScope = { accountKey: accountKeyValue, epoch: accountEpoch, runId: pendingRunId, pending: pendingKeys, inFlight };
    for (const [fingerprint, key] of [...scope.pending]) {
      if (!scopeIsCurrent(scope) || !active()) return;
      if (scope.inFlight.has(fingerprint)) continue;
      try {
        const result = await supportApi.commandResult(key);
        if (!scopeIsCurrent(scope) || !active()) return;
        if (scope.inFlight.has(fingerprint)) continue;
        if (result?.kind !== "ticket") continue;
        replace(result.ticket);
        completePending(scope, fingerprint);
      } catch { /* unknown remains durable until the authoritative readback succeeds */ }
    }
  }

  function clearAccount() {
    accountEpoch += 1; tickets.value = []; error.value = null; loading.value = false;
    listRequestGeneration += 1; ticketRequestGeneration.clear();
    inFlight = new Map(); mutating.value = false;
  }
  function bindAccount(accountKey: string) {
    clearAccount();
    accountKeyValue = accountKey;
    pendingRunId = remoteApiEnabled ? "unverified" : "mock";
    pendingKeys = new Map();
    // 启动预热是 fire-and-forget:权威不可达自吞(resilience 门)。pendingRunId 留
    // "unverified",首次 refresh()/load() 重走 preparePendingRun 并按各自路径报错;
    // preparePendingRun 本身保持 reject 契约(refresh/load/reconcile 靠它报错)。
    if (remoteApiEnabled) void preparePendingRun().then(() => reconcilePending()).catch(() => undefined);
  }
  function reset() { clearAccount(); pendingKeys = new Map(); }

  return { tickets, loading, mutating, error, refresh, cancelRefresh, load, loadEarlier, markRead, createTicket, reply, close, reset, bindAccount };
});
