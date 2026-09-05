import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type ExchangeDirection = "USDT_TO_NEX" | "NEX_TO_USDT";
export type ExchangeAsset = "USDT" | "NEX";
export type ExchangeOrderStatus =
  | "COMPLETED"
  | "SUCCESS"
  | "QUEUED"
  | "CANCELLED"
  | "USER_CAP"
  | "PLATFORM_CAP"
  | "GEO_BLOCKED";

export interface ExchangeCaps {
  currentPrice: number;
  userDailyCapUsdt: number;
  platformDailyCapUsdt: number;
  feePct: number;
  feeMinUsdt: number;
  queueMode: "QUEUE" | "REJECT";
  swapEnabled: boolean;
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
  order?: ExchangeOrder;
  gate?: "USER_CAP" | "PLATFORM_CAP" | "GEO_BLOCKED";
  feeUsdt?: number;
  receiptId?: string;
}

export interface ExchangeApi {
  fetchCaps(): Promise<ExchangeCaps>;
  fetchState(): Promise<ExchangeSnapshot>;
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

function parseCaps(value: unknown): ExchangeCaps {
  const row = record(value);
  const currentPrice = number(row?.currentPrice, Number.EPSILON);
  const userDailyCapUsdt = number(row?.userDailyCapUsdt);
  const platformDailyCapUsdt = number(row?.platformDailyCapUsdt);
  const feePct = number(row?.feePct);
  const feeMinUsdt = number(row?.feeMinUsdt);
  const queueMode = text(row?.queueMode)?.toUpperCase();
  if (!row || row.asset !== "NEX" || row.currency !== "USDT"
      || row.serverCanonical !== true || row.source !== "G2/G3 server configuration"
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
    queueMode: queueMode as ExchangeCaps["queueMode"],
    swapEnabled: row.swapEnabled,
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
    const raw = text(row.createdAt);
    const parsed = raw ? Date.parse(raw) : Number.NaN;
    if (!Number.isFinite(parsed)) return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
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

function parseSnapshot(value: unknown): ExchangeSnapshot {
  const row = record(value);
  const wallet = record(row?.wallet);
  const usdtAvailable = number(wallet?.usdtAvailable);
  const nexAvailable = number(wallet?.nexAvailable);
  const todayUserUsedUsdt = number(row?.todayUserUsedUsdt);
  const todayPlatformUsedUsdt = number(row?.todayPlatformUsedUsdt);
  const lifetimeExchangedUsdt = number(row?.lifetimeExchangedUsdt);
  if (!row || row.serverCanonical !== true || !wallet
      || usdtAvailable === null || nexAvailable === null
      || todayUserUsedUsdt === null || todayPlatformUsedUsdt === null
      || lifetimeExchangedUsdt === null
      || !Array.isArray(row.orders)) {
    return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
  }
  const orders = row.orders.map(parseOrder);
  if (new Set(orders.map((order) => order.exchangeNo)).size !== orders.length) {
    return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
  }
  const gate = optionalText(row, "gate")?.toUpperCase();
  if (gate && !["USER_CAP", "PLATFORM_CAP", "GEO_BLOCKED"].includes(gate)) {
    return invalid("EXCHANGE_STATE_RESPONSE_INVALID");
  }
  return {
    caps: parseCaps(row.caps),
    wallet: { usdtAvailable, nexAvailable },
    todayUserUsedUsdt,
    todayPlatformUsedUsdt,
    lifetimeExchangedUsdt,
    orders,
    order: row.order === undefined ? undefined : parseOrder(row.order),
    gate: gate as ExchangeSnapshot["gate"],
    feeUsdt: optionalNumber(row, "feeUsdt"),
    receiptId: optionalText(row, "receiptId"),
  };
}

export function createExchangeApi(client: ApiClient): ExchangeApi {
  return {
    fetchCaps: async () => parseCaps(await client.request({
      method: "GET",
      path: "/api/config/exchange/caps",
      authenticated: false,
    })),
    fetchState: async () => parseSnapshot(await client.request({
      method: "GET",
      path: "/api/exchange",
    })),
    swap: async (direction, fromAmount, queueIfCapped, idempotencyKey) =>
      parseSnapshot(await client.request({
        method: "POST",
        path: "/api/exchange",
        body: { direction, fromAmount, queueIfCapped },
        idempotencyKey,
        timeoutMs: 30_000,
      })),
    cancel: async (exchangeNo, idempotencyKey) =>
      parseSnapshot(await client.request({
        method: "POST",
        path: `/api/exchange/${encodeURIComponent(exchangeNo)}/cancel`,
        idempotencyKey,
        timeoutMs: 30_000,
      })),
  };
}
