import type { ApiClient } from "./api-client";
import { parseServerTimestamp } from "./server-time";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { historySnapshotQuery, parseHistorySnapshotId } from "./history-snapshot";

export type ExchangeDirection = "USDT_TO_NEX" | "NEX_TO_USDT";
export type ExchangeAsset = "USDT" | "NEX";
export type ExchangeOrderStatus =
  | "COMPLETED"
  | "SUCCESS"
  | "QUEUED"
  | "CANCELLED"
  | "FAILED"
  | "USER_CAP"
  | "PLATFORM_CAP"
  | "GEO_BLOCKED";

export interface ExchangeCaps {
  currentPrice: number;
  userDailyCapUsdt: number;
  platformDailyCapUsdt: number;
  feePct: number;
  feeMinUsdt: number;
  /** Added by the current backend; null keeps older snapshots parseable while remote UI fails closed. */
  minUsdt: number | null;
  minNex: number | null;
  queueMode: "QUEUE" | "REJECT";
  swapEnabled: boolean;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface ExchangeOrder {
  exchangeNo: string;
  fromAsset: ExchangeAsset;
  toAsset: ExchangeAsset;
  fromAmount: number;
  toAmount: number;
  rate: number;
  status: ExchangeOrderStatus;
  createdAt?: number;
}

export interface ExchangeSnapshot {
  caps: ExchangeCaps;
  wallet: {
    usdtAvailable: number;
    nexAvailable: number;
  };
  todayUserUsedUsdt: number;
  todayPlatformUsedUsdt: number;
  lifetimeExchangedUsdt: number;
  orders: ExchangeOrder[];
  ordersPage: { total: number; pageNum: number; pageSize: number; snapshotId?: string };
  order?: ExchangeOrder;
  gate?: "USER_CAP" | "PLATFORM_CAP" | "GEO_BLOCKED";
  feeUsdt?: number;
  receiptId?: string;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface ExchangeRecovery {
  status: "SUCCEEDED" | "FAILED" | "PROCESSING" | "UNKNOWN" | "NOT_FOUND" | "MISMATCH";
  order?: ExchangeOrder;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface ExchangeApi {
  fetchCaps(): Promise<ExchangeCaps>;
  fetchState(pageNum?: number, pageSize?: number, snapshotId?: string): Promise<ExchangeSnapshot>;
  recover(direction: ExchangeDirection, fromAmount: number, queueIfCapped: boolean,
    idempotencyKey: string): Promise<ExchangeRecovery>;
  swap(
    direction: ExchangeDirection,
    fromAmount: number,
    queueIfCapped: boolean,
    idempotencyKey: string,
  ): Promise<ExchangeSnapshot>;
  cancel(exchangeNo: string, idempotencyKey: string): Promise<ExchangeSnapshot>;
}

const ORDER_STATUSES = new Set<ExchangeOrderStatus>([
  "COMPLETED",
  "SUCCESS",
  "QUEUED",
  "CANCELLED",
  "FAILED",
  "USER_CAP",
  "PLATFORM_CAP",
  "GEO_BLOCKED",
]);
function invalid(message: string): never {
  throw new ApiError({ kind: "protocol", message });
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

function optionalText(row: Record<string, unknown>, key: string): string | undefined {
  if (!(key in row) || row[key] === null) return undefined;
  return text(row[key]) ?? invalid("EXCHANGE_STATE_RESPONSE_INVALID");
}

function optionalNumber(row: Record<string, unknown>, key: string): number | undefined {
  if (!(key in row) || row[key] === null) return undefined;
  const parsed = number(row[key]);
  return parsed ?? invalid("EXCHANGE_STATE_RESPONSE_INVALID");
}

function validAuthority(row: Record<string, unknown> | null, mode: ApiEnvironment): boolean {
  if (!row || row.serverCanonical !== true) return false;
  return (mode === "dev" || mode === "prod")
    && row.sourceEnvironment === "PRODUCTION" && row.runId === "";
}

function parseCaps(value: unknown, mode: ApiEnvironment): ExchangeCaps {
  const row = record(value);
  const currentPrice = number(row?.currentPrice, Number.EPSILON);
  const userDailyCapUsdt = number(row?.userDailyCapUsdt);
  const platformDailyCapUsdt = number(row?.platformDailyCapUsdt);
  const feePct = number(row?.feePct);
  const feeMinUsdt = number(row?.feeMinUsdt);
  const minUsdt = number(row?.minUsdt, Number.EPSILON);
  const minNex = number(row?.minNex, Number.EPSILON);
  const queueMode = text(row?.queueMode)?.toUpperCase();
  if (!row || row.asset !== "NEX" || row.currency !== "USDT"
      || !validAuthority(row, mode) || row.source !== "G2/G3 server configuration"
      || currentPrice === null || userDailyCapUsdt === null || userDailyCapUsdt > 10_000
      || platformDailyCapUsdt === null || platformDailyCapUsdt > 10_000_000
      || feePct === null || feePct > 10 || feeMinUsdt === null || feeMinUsdt > 5
      || !["QUEUE", "REJECT"].includes(queueMode ?? "")
      || typeof row.swapEnabled !== "boolean") {
    return invalid("EXCHANGE_CAPS_RESPONSE_INVALID");
  }
  return {
    currentPrice,
    userDailyCapUsdt,
    platformDailyCapUsdt,
    feePct,
    feeMinUsdt,
    minUsdt,
    minNex,
    queueMode: queueMode as ExchangeCaps["queueMode"],
    swapEnabled: row.swapEnabled,
    sourceEnvironment: row.sourceEnvironment as ExchangeCaps["sourceEnvironment"],
    runId: row.runId as string,
  };
}

function parseOrder(value: unknown): ExchangeOrder {
  const row = record(value);
  const exchangeNo = text(row?.exchangeNo);
  const fromAsset = text(row?.fromAsset)?.toUpperCase();
  const toAsset = text(row?.toAsset)?.toUpperCase();
  const fromAmount = number(row?.fromAmount, Number.EPSILON);
  const toAmount = number(row?.toAmount);
  const rate = number(row?.rate, Number.EPSILON);
  const status = text(row?.status)?.toUpperCase() as ExchangeOrderStatus | undefined;
  if (!row || !exchangeNo || !/^EX-[A-Za-z0-9-]{8,90}$/.test(exchangeNo)
      || !["USDT", "NEX"].includes(fromAsset ?? "") || !["USDT", "NEX"].includes(toAsset ?? "")
      || fromAsset === toAsset || fromAmount === null || toAmount === null || rate === null
      || !status || !ORDER_STATUSES.has(status)) {
    return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
  }
  let createdAt: number | undefined;
  if ("createdAt" in row && row.createdAt !== null) {
    const parsed = parseServerTimestamp(row.createdAt);
    if (parsed === null) return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
    createdAt = parsed;
  }
  return {
    exchangeNo,
    fromAsset: fromAsset as ExchangeAsset,
    toAsset: toAsset as ExchangeAsset,
    fromAmount,
    toAmount,
    rate,
    status,
    createdAt,
  };
}

function parseSnapshot(value: unknown, mode: ApiEnvironment): ExchangeSnapshot {
  const row = record(value);
  const wallet = record(row?.wallet);
  const usdtAvailable = number(wallet?.usdtAvailable);
  const nexAvailable = number(wallet?.nexAvailable);
  const todayUserUsedUsdt = number(row?.todayUserUsedUsdt);
  const todayPlatformUsedUsdt = number(row?.todayPlatformUsedUsdt);
  const lifetimeExchangedUsdt = number(row?.lifetimeExchangedUsdt);
  if (!row || !validAuthority(row, mode) || !wallet
      || usdtAvailable === null || nexAvailable === null
      || todayUserUsedUsdt === null || todayPlatformUsedUsdt === null
      || lifetimeExchangedUsdt === null
      || !Array.isArray(row.orders)) {
    return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
  }
  const orders = row.orders.map(parseOrder);
  const ordersPage = record(row.ordersPage);
  const total = number(ordersPage?.total);
  const pageNum = number(ordersPage?.pageNum, 1);
  const pageSize = number(ordersPage?.pageSize, 1);
  if (new Set(orders.map((order) => order.exchangeNo)).size !== orders.length) {
    return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
  }
  if (!ordersPage || total === null || pageNum === null || pageSize === null
      || !Number.isSafeInteger(pageNum) || !Number.isSafeInteger(pageSize)
      || orders.length > pageSize || orders.length > total) {
    return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
  }
  const gate = optionalText(row, "gate")?.toUpperCase();
  if (gate && !["USER_CAP", "PLATFORM_CAP", "GEO_BLOCKED"].includes(gate)) {
    return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
  }
  const caps = parseCaps(row.caps, mode);
  if (caps.sourceEnvironment !== row.sourceEnvironment || caps.runId !== row.runId) {
    return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
  }
  const snapshotId = parseHistorySnapshotId(ordersPage.snapshotId);
  return {
    caps,
    wallet: { usdtAvailable, nexAvailable },
    todayUserUsedUsdt,
    todayPlatformUsedUsdt,
    lifetimeExchangedUsdt,
    orders,
    ordersPage: { total, pageNum, pageSize, snapshotId },
    order: row.order === undefined ? undefined : parseOrder(row.order),
    gate: gate as ExchangeSnapshot["gate"],
    feeUsdt: optionalNumber(row, "feeUsdt"),
    receiptId: optionalText(row, "receiptId"),
    sourceEnvironment: row.sourceEnvironment as ExchangeSnapshot["sourceEnvironment"],
    runId: row.runId as string,
  };
}

export function createExchangeApi(client: ApiClient, mode: ApiEnvironment = "prod"): ExchangeApi {
  return {
    fetchCaps: async () => parseCaps(await client.request({
      method: "GET",
      path: "/api/config/exchange/caps",
      authenticated: false,
    }), mode),
    fetchState: async (pageNum = 1, pageSize = 20, snapshotId) => parseSnapshot(await client.request({
      method: "GET",
      path: `/api/exchange?pageNum=${pageNum}&pageSize=${pageSize}${historySnapshotQuery(snapshotId)}`,
    }), mode),
    recover: async (direction, fromAmount, queueIfCapped, idempotencyKey) => {
      const row = record(await client.request({
        method: "GET",
        path: `/api/exchange/recovery?direction=${encodeURIComponent(direction)}&fromAmount=${encodeURIComponent(fromAmount)}&queueIfCapped=${queueIfCapped}`,
        idempotencyKey,
      }));
      if (!row || !["dev", "prod"].includes(mode) || row.sourceEnvironment !== "PRODUCTION" || row.runId !== ""
          || typeof row.status !== "string"
          || !["SUCCEEDED", "FAILED", "PROCESSING", "UNKNOWN", "NOT_FOUND", "MISMATCH"].includes(row.status)
          || (row.status !== "SUCCEEDED" && row.order !== undefined)) {
        return invalid("EXCHANGE_RECOVERY_RESPONSE_INVALID");
      }
      return {
        status: row.status as ExchangeRecovery["status"],
        order: row.status === "SUCCEEDED" ? parseOrder(row.order) : undefined,
        sourceEnvironment: "PRODUCTION", runId: "",
      };
    },
    swap: async (direction, fromAmount, queueIfCapped, idempotencyKey) =>
      parseSnapshot(await client.request({
        method: "POST",
        path: "/api/exchange",
        body: { direction, fromAmount, queueIfCapped },
        idempotencyKey,
        timeoutMs: 30_000,
      }), mode),
    cancel: async (exchangeNo, idempotencyKey) =>
      parseSnapshot(await client.request({
        method: "POST",
        path: `/api/exchange/${encodeURIComponent(exchangeNo)}/cancel`,
        idempotencyKey,
        timeoutMs: 30_000,
      }), mode),
  };
}
