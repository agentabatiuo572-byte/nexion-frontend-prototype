import { defineStore } from "pinia";
import { ref } from "vue";
import { supportApi } from "@/api/runtime";
import { remoteApiEnabled } from "@/api/runtime";
import { asApiError } from "@/api/errors";
import type { Ticket, TicketCategory } from "@/domain/support";

function mutationKey(scope: string): string {
  const label = scope.split(":", 1)[0].replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "command";
  return `support-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
const PENDING_STORAGE = "support-pending-commands";
const pendingStorageKey = (accountKey: string, runId: string) => `${PENDING_STORAGE}:${accountKey}:${runId}:tickets`;
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

  function replace(ticket: Ticket) {
    const prior = tickets.value.find((row) => row.id === ticket.id);
    if (prior && (ticket.version < prior.version || (ticket.version === prior.version && ticket.updatedAt < prior.updatedAt))) return;
    const rest = tickets.value.filter((row) => row.id !== ticket.id);
    tickets.value = [ticket, ...rest].sort((a, b) => b.lastReplyAt - a.lastReplyAt);
  }

  /** A delayed page is allowed to fill gaps, never to erase or regress a newer local snapshot. */
  function mergeTickets(items: Ticket[]) { for (const ticket of items) replace(ticket); }

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
      const items = (await supportApi.tickets()).items;
      if (snapshotIsCurrent(scope) && requestGeneration === listRequestGeneration) mergeTickets(items);
    } catch (cause) {
      if (epoch === accountEpoch) {
        error.value = cause instanceof Error ? cause.message : "SUPPORT_TICKETS_LOAD_FAILED";
      }
      throw cause;
    } finally {
      if (epoch === accountEpoch) loading.value = false;
    }
  }

  async function load(id: string): Promise<Ticket> {
    const epoch = accountEpoch;
    const accountKey = accountKeyValue;
    await preparePendingRun();
    if (epoch !== accountEpoch || accountKey !== accountKeyValue) throw new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    const scope = snapshotScope();
    const requestGeneration = (ticketRequestGeneration.get(id) ?? 0) + 1;
    ticketRequestGeneration.set(id, requestGeneration);
    const ticket = await supportApi.ticket(id);
    if (snapshotIsCurrent(scope) && ticketRequestGeneration.get(id) === requestGeneration) replace(ticket);
    return ticket;
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
    try {
      const accountKey = accountKeyValue;
      await preparePendingRun();
      if (epoch !== accountEpoch || accountKey !== accountKeyValue) return;
      const scope = snapshotScope();
      const requestGeneration = ++listRequestGeneration;
      const items = (await supportApi.tickets()).items;
      if (snapshotIsCurrent(scope) && requestGeneration === listRequestGeneration) mergeTickets(items);
    } catch {
      // The original failure remains authoritative; reconciliation is best effort.
    }
  }

  async function reconcilePending(): Promise<void> {
    const scope: CommandScope = { accountKey: accountKeyValue, epoch: accountEpoch, runId: pendingRunId, pending: pendingKeys, inFlight };
    for (const [fingerprint, key] of [...scope.pending]) {
      try {
        const result = await supportApi.commandResult(key);
        if (result?.kind !== "ticket") continue;
        if (scopeIsCurrent(scope)) replace(result.ticket);
        scope.pending.delete(fingerprint);
        persistPending(scope.accountKey, scope.runId, scope.pending);
      } catch { /* unknown remains durable until the authoritative readback succeeds */ }
    }
  }

  function clearAccount() {
    accountEpoch += 1; tickets.value = []; error.value = null;
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
    if (remoteApiEnabled) void preparePendingRun().then(reconcilePending).catch(() => undefined);
  }
  function reset() { clearAccount(); pendingKeys = new Map(); }

  return { tickets, loading, mutating, error, refresh, load, createTicket, reply, close, reset, bindAccount };
});
