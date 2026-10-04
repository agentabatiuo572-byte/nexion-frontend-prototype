import { defineStore } from "pinia";
import { onScopeDispose, ref } from "vue";
import { commissionConfigApi, remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { CanonicalBinaryState, CanonicalCommissionConfig } from "@/api/commission-config-api";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";

/**
 * Ported from Nexion-prototype/lib/v3/commission.ts (zustand persist → Pinia + uni storage).
 * ⚠️ MOCK-ONLY business rates table. UNILEVEL_USDT / UNILEVEL_NEX are
 * server-authoritative in production (GET /api/config/commission/rates).
 *
 * v3 玩法 — 佣金事件流(5 类):unilevel 7 层 / binary 对碰 / peer 平级 /
 * cultivation 培育 / leadership 领导池 / genesis 创世排放(上所后,非每日分红)。
 * 状态:cooling → unlocked → withdrawn。USDT 默认 30 天冷却期。
 */

export type CommissionKind =
  | "unilevel"
  | "binary"
  | "peer"
  | "cultivation"
  | "leadership"
  | "genesis";

export type CommissionStatus = "cooling" | "unlocked" | "withdrawn" | "frozen" | "reversed" | "rejected" | "simulated";

export interface CommissionEvent {
  id: string;
  kind: CommissionKind;
  sourceUserId?: string;
  sourceUserName: string;
  layer?: number;             // 仅 unilevel
  orderId?: string;
  orderAmountUSD?: number;
  amountUSDT: number;
  amountNEX: number;
  ts: number;
  unlockAt: number;           // 30d 后
  status: CommissionStatus;
  settlementState?: "SIMULATED" | "CANONICAL";
  withdrawable?: boolean;
}

const ONE_DAY = 86400 * 1000;

/** Unilevel 各层 USDT 比例 */
export const UNILEVEL_USDT: Record<number, number> = {
  1: 0.10, 2: 0.05, 3: 0.03, 4: 0.02, 5: 0.01, 6: 0.005, 7: 0.005,
};
/** Unilevel 各层 NEX 比例 (per $1 订单) */
export const UNILEVEL_NEX: Record<number, number> = {
  1: 50, 2: 20, 3: 10, 4: 5, 5: 2.5, 6: 1, 7: 1,
};

const now = Date.now();

function localDayStart(ts = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function recentTodayTs(minutesAgo: number): number {
  return Math.max(localDayStart(now), now - minutesAgo * 60 * 1000);
}

/**
 * Mock "today" commission events — `ts` is clamped inside the current local day
 * so overnight dev sessions still read a non-zero commission component. Real
 * backend: server delivers today-bucketed events via SSE (PRD §9.11c.1).
 */
function buildTodayDemoEvents(): CommissionEvent[] {
  return [
    {
      id: "c-today-1", kind: "unilevel", sourceUserId: "net-12", sourceUserName: "Mei L.",
      layer: 1, orderId: "ord-today-1", orderAmountUSD: 299,
      amountUSDT: 29.90, amountNEX: 14_950,
      ts: recentTodayTs(50), unlockAt: recentTodayTs(50) + 30 * ONE_DAY, status: "cooling",
    },
    {
      id: "c-today-2", kind: "binary", sourceUserId: "match-today", sourceUserName: "Daily binary match",
      amountUSDT: 17.30, amountNEX: 0,
      ts: recentTodayTs(20), unlockAt: recentTodayTs(20) + 30 * ONE_DAY, status: "cooling",
    },
  ];
}

function seedEvents(): CommissionEvent[] {
  return [
    ...buildTodayDemoEvents(),
    {
      id: "c-1", kind: "unilevel", sourceUserId: "net-0", sourceUserName: "Sarah K.",
      layer: 1, orderId: "ord-1", orderAmountUSD: 899,
      amountUSDT: 89.90, amountNEX: 44_950,
      ts: now - 5 * ONE_DAY, unlockAt: now + 25 * ONE_DAY, status: "cooling",
    },
    {
      id: "c-2", kind: "unilevel", sourceUserId: "net-1", sourceUserName: "Tom Wang",
      layer: 1, orderId: "ord-2", orderAmountUSD: 299,
      amountUSDT: 29.90, amountNEX: 14_950,
      ts: now - 12 * ONE_DAY, unlockAt: now + 18 * ONE_DAY, status: "cooling",
    },
    {
      id: "c-3", kind: "unilevel", sourceUserId: "net-9", sourceUserName: "Carlos R.",
      layer: 2, orderId: "ord-3", orderAmountUSD: 899,
      amountUSDT: 44.95, amountNEX: 17_980,
      ts: now - 8 * ONE_DAY, unlockAt: now + 22 * ONE_DAY, status: "cooling",
    },
    {
      id: "c-4", kind: "binary", sourceUserId: "match-1", sourceUserName: "Daily binary match",
      amountUSDT: 12.40, amountNEX: 0,
      ts: now - 1 * ONE_DAY, unlockAt: now + 29 * ONE_DAY, status: "cooling",
    },
    {
      id: "c-5", kind: "binary", sourceUserId: "match-2", sourceUserName: "Daily binary match",
      amountUSDT: 9.20, amountNEX: 0,
      ts: now - 2 * ONE_DAY, unlockAt: now + 28 * ONE_DAY, status: "cooling",
    },
    {
      id: "c-6", kind: "cultivation", sourceUserId: "net-0", sourceUserName: "Sarah K. → V1",
      amountUSDT: 0, amountNEX: 500,
      ts: now - 15 * ONE_DAY, unlockAt: now - 15 * ONE_DAY, status: "unlocked",
    },
    {
      id: "c-7", kind: "cultivation", sourceUserId: "net-1", sourceUserName: "Tom Wang → V1",
      amountUSDT: 0, amountNEX: 500,
      ts: now - 20 * ONE_DAY, unlockAt: now - 20 * ONE_DAY, status: "unlocked",
    },
    {
      id: "c-8", kind: "cultivation", sourceUserId: "net-2", sourceUserName: "Lisa Park → V1",
      amountUSDT: 0, amountNEX: 500,
      ts: now - 24 * ONE_DAY, unlockAt: now - 24 * ONE_DAY, status: "unlocked",
    },
    {
      id: "c-9", kind: "leadership", sourceUserId: "pool-w42", sourceUserName: "Week 42 pool",
      amountUSDT: 8.74, amountNEX: 0,
      ts: now - 3 * ONE_DAY, unlockAt: now - 3 * ONE_DAY, status: "unlocked",
    },
  ];
}

// 旧设备级单键 "nexgrid-commission-v1" 废弃(存量无账号归属,mock 可重建);佣金事件按账号分行。
const ACCOUNTS_KEY = "nexgrid-commission-accounts-v1"; // { [accountKey]: { events: CommissionEvent[] } }

function hydrate(accountKey: string): CommissionEvent[] {
  const row = readAccountRow<{ events?: CommissionEvent[] }>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.events)) {
    const existing = row.events;
    // Keep mock "today" events actually inside the current local day. Persisted
    // demos otherwise go stale across midnight and Home collapses back to device-only.
    const dayStart = localDayStart();
    const todayDemo = existing.filter((e) => e.id.startsWith("c-today-"));
    const hasFreshTodaySeed = todayDemo.some((e) => e.ts >= dayStart);
    if (hasFreshTodaySeed) return existing;
    return [...buildTodayDemoEvents(), ...existing.filter((e) => !e.id.startsWith("c-today-"))];
  }
  return seedEvents();
}

export const useCommission = defineStore("commission", () => {
  // 账号维度。boot 期落 "default";账号确定后由 lib/account-scope 的
  // rebindAccountScopedStores 统一重绑(P-031 store 不互 import)。
  let boundKey = "default";
  let bindingEpoch = 0;
  let configRefreshGeneration = 0;
  let binaryRefreshGeneration = 0;
  let eventsRefreshGeneration = 0;
  const events = ref<CommissionEvent[]>(remoteApiEnabled ? [] : hydrate(boundKey));
  const eventsEvidence = ref<import("@/api/team-insights-api").TeamCommissionSnapshot | null>(null);
  const config = ref<CanonicalCommissionConfig | null>(null);
  const binarySnapshot = ref<CanonicalBinaryState | null>(null);
  const eventsStatus = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");
  const eventsLoadMoreStatus = ref<"idle" | "loading" | "error">("idle");
  const eventsPage = ref(0);
  const eventsTotalRows = ref(remoteApiEnabled ? 0 : events.value.length);
  const configStatus = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");
  const binaryStatus = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");

  type RequestScope = { accountKey: string; epoch: number; commerceRun: RuntimeRevisionScope };
  const requestScope = (): RequestScope => ({ accountKey: boundKey, epoch: bindingEpoch, commerceRun: captureRuntimeRevision() });
  const isCurrentScope = (scope: RequestScope): boolean =>
    scope.accountKey === boundKey && scope.epoch === bindingEpoch && isCurrentRuntimeRevision(scope.commerceRun);
  const sameScope = (left: RequestScope, right: RequestScope): boolean =>
    left.accountKey === right.accountKey
      && left.epoch === right.epoch
      && left.commerceRun.runId === right.commerceRun.runId
      && left.commerceRun.epoch === right.commerceRun.epoch;
  let binaryInFlight: { scope: RequestScope; promise: Promise<void> } | null = null;
  let configInFlight: { scope: RequestScope; promise: Promise<void> } | null = null;

  const unsubscribeCommerceRun = subscribeRuntimeRevision(() => {
    if (!remoteApiEnabled) return;
    // A catalogue environment/RunID change invalidates every remote snapshot;
    // stale requests are also fenced by isCurrentRuntimeRevision().
    configRefreshGeneration += 1;
    binaryInFlight = null;
    config.value = null;
    binarySnapshot.value = null;
    events.value = [];
    eventsEvidence.value = null;
    configStatus.value = "idle";
    eventsStatus.value = "idle";
    eventsLoadMoreStatus.value = "idle";
    eventsPage.value = 0;
    eventsTotalRows.value = 0;
    binaryStatus.value = "idle";

    // A completed catalogue revision must also establish a new canonical
    // snapshot for the account already bound to this store.  Otherwise the
    // revision fence correctly drops the old in-flight responses, but the
    // page remains indefinitely in its reset/idle state.
    if (boundKey === "default") return;
    const scope = requestScope();
    void Promise.allSettled([
      refreshCanonicalConfig(scope),
      refreshCanonicalBinary(scope),
      refreshCanonicalEvents(scope),
    ]);
  });
  onScopeDispose(unsubscribeCommerceRun);

  function persist() {
    if (remoteApiEnabled) return;
    writeAccountRow<{ events: CommissionEvent[] }>(ACCOUNTS_KEY, boundKey, { events: events.value });
  }

  /** 账号切换重绑:装载该账号的佣金事件行(变更处处即时 persist,旧账号无需先落盘)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    bindingEpoch += 1;
    if (remoteApiEnabled) {
      configRefreshGeneration += 1;
      binaryInFlight = null;
      config.value = null;
      binarySnapshot.value = null;
      events.value = [];
      eventsEvidence.value = null;
      configStatus.value = "idle";
      eventsStatus.value = "idle";
      eventsLoadMoreStatus.value = "idle";
      eventsPage.value = 0;
      eventsTotalRows.value = 0;
      binaryStatus.value = "idle";
      const scope = requestScope();
      void Promise.allSettled([refreshCanonicalConfig(scope), refreshCanonicalBinary(scope), refreshCanonicalEvents(scope)]);
      return;
    }
    events.value = hydrate(boundKey);
  }

  function ensureCanonicalConfig(): Promise<void> {
    const scope = requestScope();
    return configInFlight && sameScope(configInFlight.scope, scope)
      ? configInFlight.promise : refreshCanonicalConfig(scope);
  }

  function refreshCanonicalConfig(scope = requestScope()): Promise<void> {
    const promise = readCanonicalConfig(scope);
    configInFlight = { scope, promise };
    const clear = () => { if (configInFlight?.promise === promise) configInFlight = null; };
    void promise.then(clear, clear);
    return promise;
  }

  async function readCanonicalConfig(scope: RequestScope) {
    if (!remoteApiEnabled) return;
    const generation = ++configRefreshGeneration;
    config.value = null;
    configStatus.value = "loading";
    try {
      const snapshot = await commissionConfigApi.rates();
      if (generation !== configRefreshGeneration || !isCurrentScope(scope)) return;
      config.value = snapshot;
      configStatus.value = "ready";
    } catch {
      if (generation === configRefreshGeneration && isCurrentScope(scope)) {
        config.value = null;
        configStatus.value = "error";
      }
    }
  }

  function refreshCanonicalBinary(scope = requestScope()): Promise<void> {
    if (!remoteApiEnabled) return Promise.resolve();
    if (binaryInFlight && sameScope(binaryInFlight.scope, scope)) return binaryInFlight.promise;
    const generation = ++binaryRefreshGeneration;
    binaryStatus.value = "loading";
    let operation!: Promise<void>;
    operation = (async () => {
      try {
        const snapshot = await commissionConfigApi.binary();
        if (generation !== binaryRefreshGeneration || !isCurrentScope(scope)) return;
        binarySnapshot.value = snapshot;
        binaryStatus.value = "ready";
      } catch {
        if (generation === binaryRefreshGeneration && isCurrentScope(scope)) {
          // The team home consumes this same snapshot.  Clear it with the
          // current-scope failure so no page can present an older estimate as
          // current authority.
          binarySnapshot.value = null;
          binaryStatus.value = "error";
        }
      }
    })();
    binaryInFlight = { scope, promise: operation };
    const clear = () => { if (binaryInFlight?.promise === operation) binaryInFlight = null; };
    void operation.then(clear, clear);
    return operation;
  }

  async function refreshCanonicalEvents(scope = requestScope()) {
    if (!remoteApiEnabled) return;
    const generation = ++eventsRefreshGeneration;
    events.value = [];
    // Keep the last confirmed aggregate during this account's read only.
    // Account/runtime resets and a failed read still remove its authority.
    eventsStatus.value = "loading";
    eventsLoadMoreStatus.value = "idle";
    eventsPage.value = 0;
    eventsTotalRows.value = 0;
    try {
      const snapshot = await teamInsightsApi.commissions(1, 20);
      if (generation !== eventsRefreshGeneration || !isCurrentScope(scope)) return;
      eventsEvidence.value = snapshot;
      events.value = snapshot.events;
      eventsPage.value = snapshot.page;
      eventsTotalRows.value = snapshot.totalRows;
      eventsStatus.value = "ready";
    } catch {
      if (generation === eventsRefreshGeneration && isCurrentScope(scope)) {
        eventsEvidence.value = null;
        eventsStatus.value = "error";
      }
    }
  }

  async function loadMoreCanonicalEvents(scope = requestScope()) {
    if (!remoteApiEnabled || eventsStatus.value !== "ready"
        || eventsLoadMoreStatus.value === "loading" || events.value.length >= eventsTotalRows.value) return;
    const nextPage = eventsPage.value + 1;
    const generation = eventsRefreshGeneration;
    eventsLoadMoreStatus.value = "loading";
    try {
      const snapshot = await teamInsightsApi.commissions(nextPage, 20, eventsEvidence.value?.snapshotAt);
      if (generation !== eventsRefreshGeneration || !isCurrentScope(scope) || snapshot.page !== nextPage) return;
      const seen = new Set(events.value.map((event) => event.id));
      const appended = [...events.value, ...snapshot.events.filter((event) => !seen.has(event.id))];
      events.value = appended;
      eventsEvidence.value = { ...snapshot, events: appended };
      eventsPage.value = snapshot.page;
      eventsTotalRows.value = snapshot.totalRows;
      eventsLoadMoreStatus.value = "idle";
    } catch {
      if (generation === eventsRefreshGeneration && isCurrentScope(scope)) eventsLoadMoreStatus.value = "error";
    }
  }

  function addEvent(e: Omit<CommissionEvent, "id" | "ts" | "unlockAt" | "status">) {
    if (remoteApiEnabled) return;
    const ev: CommissionEvent = {
      ...e,
      id: `c-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ts: Date.now(),
      unlockAt: Date.now() + (e.kind === "unilevel" || e.kind === "binary" ? 30 * ONE_DAY : 0),
      status: e.kind === "unilevel" || e.kind === "binary" ? "cooling" : "unlocked",
    };
    events.value = [ev, ...events.value];
    persist();
  }

  function unlockMatured() {
    if (remoteApiEnabled) return;
    const t = Date.now();
    const needsUpdate = events.value.some((e) => e.status === "cooling" && e.unlockAt <= t);
    if (!needsUpdate) return;
    events.value = events.value.map((e) =>
      e.status === "cooling" && e.unlockAt <= t ? { ...e, status: "unlocked" } : e,
    );
    persist();
  }

  function withdraw(id: string): boolean {
    if (remoteApiEnabled) return false;
    const e = events.value.find((x) => x.id === id);
    if (!e || e.status !== "unlocked" || e.withdrawable === false || e.settlementState === "SIMULATED") return false;
    events.value = events.value.map((x) => (x.id === id ? { ...x, status: "withdrawn" } : x));
    persist();
    return true;
  }

  function totalUSDTLifetime() {
    if (remoteApiEnabled) return eventsEvidence.value?.aggregate.totalUSDT ?? 0;
    return events.value.reduce((s, e) => s + e.amountUSDT, 0);
  }
  function totalNEXLifetime() {
    if (remoteApiEnabled) return eventsEvidence.value?.aggregate.totalNEX ?? 0;
    return events.value.reduce((s, e) => s + e.amountNEX, 0);
  }
  /** Pages must use this lookup so remote mode can never fall back to mock rates. */
  function unilevelRate(layer: number): number {
    if (remoteApiEnabled) return config.value?.unilevelUsdt[layer] ?? 0;
    return UNILEVEL_USDT[layer] ?? 0;
  }
  function unlockedUSDT() {
    if (remoteApiEnabled) return eventsEvidence.value?.aggregate.unlockedUSDT ?? 0;
    return events.value.filter((e) => e.status === "unlocked" && e.withdrawable !== false && e.settlementState !== "SIMULATED").reduce((s, e) => s + e.amountUSDT, 0);
  }
  function unlockedNEX() {
    if (remoteApiEnabled) return eventsEvidence.value?.aggregate.unlockedNEX ?? 0;
    return events.value.filter((e) => e.status === "unlocked" && e.withdrawable !== false && e.settlementState !== "SIMULATED").reduce((s, e) => s + e.amountNEX, 0);
  }
  function coolingUSDT() {
    if (remoteApiEnabled) return eventsEvidence.value?.aggregate.coolingUSDT ?? 0;
    return events.value.filter((e) => e.status === "cooling").reduce((s, e) => s + e.amountUSDT, 0);
  }
  /** sum since local midnight — Home Hero "today's earnings" cross-stream. */
  function todayUSDT() {
    if (remoteApiEnabled) return eventsEvidence.value?.aggregate.todayUSDT ?? 0;
    const cutoff = localDayStart();
    return events.value.filter((e) => e.ts >= cutoff).reduce((s, e) => s + e.amountUSDT, 0);
  }
  function monthUSDT() {
    if (remoteApiEnabled) return eventsEvidence.value?.aggregate.monthUSDT ?? 0;
    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    return events.value.filter((e) => e.ts >= cutoff).reduce((s, e) => s + e.amountUSDT, 0);
  }
  function monthNEX() {
    if (remoteApiEnabled) return eventsEvidence.value?.aggregate.monthNEX ?? 0;
    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    return events.value.filter((e) => e.ts >= cutoff).reduce((s, e) => s + e.amountNEX, 0);
  }

  function byKind(): Record<CommissionKind, { usdt: number; nex: number; count: number }> {
    const kinds: CommissionKind[] = ["unilevel", "binary", "peer", "cultivation", "leadership", "genesis"];
    const out = {} as Record<CommissionKind, { usdt: number; nex: number; count: number }>;
    for (const k of kinds) out[k] = { usdt: 0, nex: 0, count: 0 };
    if (remoteApiEnabled) return eventsEvidence.value?.aggregate.byKind ?? out;
    for (const e of events.value) {
      out[e.kind].usdt += e.amountUSDT;
      out[e.kind].nex += e.amountNEX;
      out[e.kind].count += 1;
    }
    return out;
  }

  return {
    events, eventsEvidence, config, configStatus, binarySnapshot, eventsStatus, eventsLoadMoreStatus,
    eventsPage, eventsTotalRows, binaryStatus, bindAccount,
    refreshCanonicalConfig, ensureCanonicalConfig, refreshCanonicalBinary, refreshCanonicalEvents, loadMoreCanonicalEvents, unilevelRate,
    addEvent, unlockMatured, withdraw,
    totalUSDTLifetime, totalNEXLifetime, unlockedUSDT, unlockedNEX, coolingUSDT,
    todayUSDT, monthUSDT, monthNEX, byKind,
  };
});
