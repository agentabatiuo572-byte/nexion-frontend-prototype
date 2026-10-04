import type { ApiClient } from "./api-client";
import { parseHistorySnapshotId, historySnapshotQuery } from "./history-snapshot";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { matchesRuntimeProvenance } from "./runtime-provenance";
import { parseServerTimestamp } from "./server-time";

export type RepurchaseStatus =
  | "PENDING_LOCK"
  | "ACTIVE"
  | "MATURE_UNCLAIMED"
  | "CLAIMED"
  | "EARLY_WITHDRAWN";

export interface RepurchaseConfig {
  apyPct: number;
  lockDays: number;
  nurtureMultiplier: number;
  h1ReinvestMultiplier: number;
  effectiveNurtureMultiplier: number;
  ticketPerOrder: number;
  presets: number[];
  earlyPenaltyPct: number;
  minAmountUsdt: number;
  enabled: boolean;
  disclosureRequired: boolean;
  currentNexPriceUsdt: number;
  g4LotteryCapacity: number;
  g4TicketsIssuedThisMonth: number;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface RepurchaseOrder {
  orderNo: string;
  amountUsdt: number;
  apyPct: number;
  earlyPenaltyPct: number;
  lockDays: number;
  lockedAt: number;
  unlockAt: number;
  estimatedInterestUsdt: number;
  status: RepurchaseStatus;
}

export interface RepurchaseSnapshot {
  orders: RepurchaseOrder[];
  ordersPage: { total: number; pageNum: number; pageSize: number; snapshotId?: string };
  walletBalanceUsdt: number;
  serverTime: number;
  focusOrderNo?: string;
  billNo?: string;
  receiptId?: string;
  creditedUsdt?: number;
  penaltyUsdt?: number;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface RepurchaseApi {
  fetchConfig(): Promise<RepurchaseConfig>;
  fetchOrders(): Promise<RepurchaseSnapshot>;
  open(amountUsdt: number, idempotencyKey: string): Promise<RepurchaseSnapshot>;
  claim(orderNo: string, idempotencyKey: string): Promise<RepurchaseSnapshot>;
  earlyWithdraw(orderNo: string, idempotencyKey: string): Promise<RepurchaseSnapshot>;
}

const STATUSES = new Set<RepurchaseStatus>([
  "PENDING_LOCK",
  "ACTIVE",
  "MATURE_UNCLAIMED",
  "CLAIMED",
  "EARLY_WITHDRAWN",
]);

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "REPURCHASE_RESPONSE_INVALID" });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown, min = 0): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : null;
}

function integer(value: unknown, min = 0): number | null {
  const parsed = number(value, min);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function timestamp(value: unknown): number | null {
  return parseServerTimestamp(value);
}

function optionalText(row: Record<string, unknown>, key: string): string | undefined {
  if (!(key in row) || row[key] === null) return undefined;
  return text(row[key]) ?? invalid();
}

function optionalMoney(row: Record<string, unknown>, key: string): number | undefined {
  if (!(key in row) || row[key] === null) return undefined;
  return number(row[key]) ?? invalid();
}

function parseConfig(value: unknown, mode: ApiEnvironment): RepurchaseConfig {
  const row = record(value);
  const apyPct = number(row?.apyPct);
  const lockDays = integer(row?.lockDays, 1);
  const nurtureMultiplier = number(row?.nurtureMultiplier, 1);
  const h1ReinvestMultiplier = number(row?.h1ReinvestMultiplier, 1);
  const effectiveNurtureMultiplier = number(row?.effectiveNurtureMultiplier, 1);
  const ticketPerOrder = integer(row?.ticketPerOrder);
  const earlyPenaltyPct = number(row?.earlyPenaltyPct);
  const minAmountUsdt = number(row?.minAmountUsdt, Number.EPSILON);
  const currentNexPriceUsdt = number(row?.currentNexPriceUsdt, Number.EPSILON);
  const g4LotteryCapacity = integer(row?.g4LotteryCapacity);
  const g4TicketsIssuedThisMonth = integer(row?.g4TicketsIssuedThisMonth);
  const rawPresets = row?.presets;
  const presets = Array.isArray(rawPresets)
    ? rawPresets.map((entry) => number(entry, Number.EPSILON))
    : [];
  const expectedSource = "nx_repurchase_product + nx_config_item + nx_emergency_control_setting";
  if (!row || row.product !== "repurchase" || row.asset !== "USDT"
      || row.serverCanonical !== true || !matchesRuntimeProvenance(row, mode, expectedSource)
      || row.pointsReward !== false
      || apyPct === null || apyPct > 300 || lockDays === null
      || nurtureMultiplier === null || nurtureMultiplier > 10
      || h1ReinvestMultiplier === null || h1ReinvestMultiplier > 10
      || effectiveNurtureMultiplier === null || effectiveNurtureMultiplier > 100
      || ticketPerOrder === null || earlyPenaltyPct === null || earlyPenaltyPct > 100
      || minAmountUsdt === null || currentNexPriceUsdt === null
      || g4LotteryCapacity === null || g4TicketsIssuedThisMonth === null
      || g4TicketsIssuedThisMonth > g4LotteryCapacity
      || typeof row.enabled !== "boolean" || typeof row.disclosureRequired !== "boolean"
      || presets.length === 0 || presets.some((entry) => entry === null)) {
    return invalid();
  }
  const normalizedPresets = presets as number[];
  if (new Set(normalizedPresets).size !== normalizedPresets.length
      || normalizedPresets.some((entry, index) => index > 0 && entry <= normalizedPresets[index - 1])) {
    return invalid();
  }
  return {
    apyPct,
    lockDays,
    nurtureMultiplier,
    h1ReinvestMultiplier,
    effectiveNurtureMultiplier,
    ticketPerOrder,
    presets: normalizedPresets,
    earlyPenaltyPct,
    minAmountUsdt,
    enabled: row.enabled,
    disclosureRequired: row.disclosureRequired,
    currentNexPriceUsdt,
    g4LotteryCapacity,
    g4TicketsIssuedThisMonth,
    sourceEnvironment: row.sourceEnvironment,
    runId: row.runId,
  };
}

function parseOrder(value: unknown): RepurchaseOrder {
  const row = record(value);
  const orderNo = text(row?.orderNo);
  const amountUsdt = number(row?.amountUsdt, Number.EPSILON);
  const apyPct = number(row?.apyPct);
  const earlyPenaltyPct = number(row?.earlyPenaltyPct);
  const lockDays = integer(row?.lockDays, 1);
  const lockedAt = timestamp(row?.lockedAt);
  const unlockAt = timestamp(row?.unlockAt);
  const estimatedInterestUsdt = number(row?.estimatedInterestUsdt);
  const status = text(row?.status)?.toUpperCase() as RepurchaseStatus | undefined;
  if (!row || !orderNo || !/^RPS-[A-Za-z0-9]{8,80}$/.test(orderNo)
      || amountUsdt === null || apyPct === null || apyPct > 300
      || earlyPenaltyPct === null || earlyPenaltyPct > 100 || lockDays === null
      || lockedAt === null || unlockAt === null || unlockAt <= lockedAt
      || estimatedInterestUsdt === null || !status || !STATUSES.has(status)) {
    return invalid();
  }
  return {
    orderNo,
    amountUsdt,
    apyPct,
    earlyPenaltyPct,
    lockDays,
    lockedAt,
    unlockAt,
    estimatedInterestUsdt,
    status,
  };
}

function parseSnapshot(value: unknown, mode: ApiEnvironment): RepurchaseSnapshot {
  const row = record(value);
  const walletBalanceUsdt = number(row?.walletBalanceUsdt);
  const serverTime = timestamp(row?.serverTime);
  const rawOrders = row?.orders;
  const expectedSource = "nx_repurchase_product + nx_config_item + nx_emergency_control_setting";
  if (!row || row.serverCanonical !== true || !matchesRuntimeProvenance(row, mode, expectedSource)
      || !Array.isArray(rawOrders)
      || walletBalanceUsdt === null || serverTime === null) {
    return invalid();
  }
  const validRow = row;
  const orders = rawOrders.map(parseOrder);
  const page = record(row.ordersPage);
  const total = integer(page?.total);
  const pageNum = integer(page?.pageNum, 1);
  const pageSize = integer(page?.pageSize, 1);
  if (new Set(orders.map((order) => order.orderNo)).size !== orders.length) return invalid();
  if (!page || total === null || pageNum === null || pageSize === null
      || orders.length > pageSize || orders.length > total) return invalid();
  return {
    orders,
    ordersPage: { total, pageNum, pageSize, snapshotId: parseHistorySnapshotId(page.snapshotId) },
    walletBalanceUsdt,
    serverTime,
    focusOrderNo: optionalText(validRow, "focusOrderNo"),
    billNo: optionalText(validRow, "billNo"),
    receiptId: optionalText(validRow, "receiptId"),
    creditedUsdt: optionalMoney(validRow, "creditedUsdt"),
    penaltyUsdt: optionalMoney(validRow, "penaltyUsdt"),
    sourceEnvironment: row.sourceEnvironment,
    runId: row.runId,
  };
}

function requireKey(value: string): string {
  const key = value.trim();
  if (!key) throw new ApiError({ kind: "protocol", message: "IDEMPOTENCY_KEY_REQUIRED" });
  return key;
}

export function createRepurchaseApi(client: ApiClient, mode: ApiEnvironment = "prod"): RepurchaseApi {
  const fetchAllOrders = async (): Promise<RepurchaseSnapshot> => {
    const first = parseSnapshot(await client.request({
      method: "GET", path: "/api/repurchase/orders?pageNum=1&pageSize=50",
    }), mode);
    if (first.ordersPage.pageNum !== 1 || first.ordersPage.pageSize !== 50) return invalid();
    const orders = [...first.orders];
    const ids = new Set(orders.map((order) => order.orderNo));
    let pageNum = first.ordersPage.pageNum;
    while (orders.length < first.ordersPage.total) {
      pageNum += 1;
      const next = parseSnapshot(await client.request({
        method: "GET", path: `/api/repurchase/orders?pageNum=${pageNum}&pageSize=${first.ordersPage.pageSize}${historySnapshotQuery(first.ordersPage.snapshotId)}`,
      }), mode);
      if (next.ordersPage.snapshotId !== first.ordersPage.snapshotId || next.ordersPage.pageNum !== pageNum || next.ordersPage.pageSize !== first.ordersPage.pageSize
          || next.ordersPage.total !== first.ordersPage.total || next.orders.length === 0) return invalid();
      for (const order of next.orders) {
        if (ids.has(order.orderNo)) return invalid();
        ids.add(order.orderNo);
        orders.push(order);
      }
    }
    return { ...first, orders, ordersPage: { ...first.ordersPage, pageNum } };
  };
  return {
    fetchConfig: async () => parseConfig(await client.request({
      method: "GET",
      path: "/api/config/repurchase",
      authenticated: false,
    }), mode),
    fetchOrders: fetchAllOrders,
    open: async (amountUsdt, idempotencyKey) => parseSnapshot(await client.request({
      method: "POST",
      path: "/api/repurchase/orders",
      body: { amountUsdt },
      idempotencyKey: requireKey(idempotencyKey),
      timeoutMs: 30_000,
    }), mode),
    claim: async (orderNo, idempotencyKey) => parseSnapshot(await client.request({
      method: "POST",
      path: `/api/repurchase/orders/${encodeURIComponent(orderNo)}/claim`,
      idempotencyKey: requireKey(idempotencyKey),
      timeoutMs: 30_000,
    }), mode),
    earlyWithdraw: async (orderNo, idempotencyKey) => parseSnapshot(await client.request({
      method: "POST",
      path: `/api/repurchase/orders/${encodeURIComponent(orderNo)}/early-withdraw`,
      idempotencyKey: requireKey(idempotencyKey),
      timeoutMs: 30_000,
    }), mode),
  };
}
