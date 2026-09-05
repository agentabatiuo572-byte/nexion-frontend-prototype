import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface VietQrPaymentConfig {
  enabled: boolean;
  minDepositUsdt: number;
  maxDepositUsdt: number;
  toleranceVnd: number;
  graceMinutes: number;
  version: number;
  feeVnd: number;
  feeUsdt: number;
}

export interface PaymentConfig {
  vietQr: VietQrPaymentConfig;
}

export interface FxQuoteSnapshot {
  baseRateVndPerUsdt: number;
  buySpreadPct: number;
  quoteRateVndPerUsdt: number;
  lockWindowMinutes: number;
  version: number;
  asOf: string;
}

export type VietQrIntentStatus =
  | "awaiting_payment"
  | "receipt_review"
  | "credited"
  | "expired"
  | "mismatch_review"
  | "late_review"
  | "cancelled"
  | "return_pending"
  | "returned";

export interface VietQrIntentSnapshot {
  intentNo: string;
  usdtAmount: number;
  fxRate: number;
  vndAmount: number;
  memoCode: string;
  bankAccount: {
    accountName: string;
    accountNumber: string;
    bankName: string;
  };
  status: VietQrIntentStatus;
  expiresAt: string;
  creditedUsdt: number;
  feeVnd: number;
  feeUsdt: number;
  qrPayload?: string;
  version: number;
  receivedVnd?: number;
  matchedAt?: string;
  createdAt?: string;
}

export interface VietQrReceiptSnapshot {
  receiptNo: string;
  intentNo: string;
  viewType: string;
  status: string;
  payableVnd?: number;
  receivedVnd?: number;
  lockedFxRate: number;
  creditedUsdt: number;
  expiresAt?: string;
  receivedAt?: string;
  createdAt: string;
}

export interface VietQrReceiptPage {
  items: VietQrReceiptSnapshot[];
  nextOffset: number | null;
}

export interface PaymentApi {
  config(): Promise<PaymentConfig>;
  fxQuote(): Promise<FxQuoteSnapshot>;
  createVietQrIntent(usdtAmount: number, idempotencyKey: string): Promise<VietQrIntentSnapshot>;
  listVietQrIntents(limit?: number): Promise<VietQrIntentSnapshot[]>;
  getVietQrIntent(intentNo: string): Promise<VietQrIntentSnapshot>;
  cancelVietQrIntent(
    intentNo: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<VietQrIntentSnapshot>;
  listVietQrReceipts(limit?: number, offset?: number): Promise<VietQrReceiptPage>;
}

const INTENT_STATUSES = new Set<VietQrIntentStatus>([
  "awaiting_payment",
  "receipt_review",
  "credited",
  "expired",
  "mismatch_review",
  "late_review",
  "cancelled",
  "return_pending",
  "returned",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function number(value: unknown, options: { min?: number; integer?: boolean } = {}): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (options.min !== undefined && value < options.min) return null;
  if (options.integer && !Number.isSafeInteger(value)) return null;
  return value;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function date(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function parseConfig(value: unknown): PaymentConfig {
  const source = record(value);
  const vietQr = record(source?.vietQr);
  const minDepositUsdt = number(vietQr?.minDepositUsdt, { min: 0 });
  const maxDepositUsdt = number(vietQr?.maxDepositUsdt, { min: 0 });
  const toleranceVnd = number(vietQr?.toleranceVnd, { min: 0 });
  const graceMinutes = number(vietQr?.graceMinutes, { min: 0, integer: true });
  const version = number(vietQr?.version, { min: 0, integer: true });
  const feeVnd = number(vietQr?.feeVnd, { min: 0 });
  const feeUsdt = number(vietQr?.feeUsdt, { min: 0 });
  if (
    !vietQr
    || typeof vietQr.enabled !== "boolean"
    || minDepositUsdt === null
    || maxDepositUsdt === null
    || maxDepositUsdt < minDepositUsdt
    || toleranceVnd === null
    || graceMinutes === null
    || version === null
    || feeVnd === null
    || feeUsdt === null
  ) {
    throw new ApiError({ kind: "protocol", message: "PAYMENT_CONFIG_RESPONSE_INVALID" });
  }
  return {
    vietQr: {
      enabled: vietQr.enabled,
      minDepositUsdt,
      maxDepositUsdt,
      toleranceVnd,
      graceMinutes,
      version,
      feeVnd,
      feeUsdt,
    },
  };
}

function parseFxQuote(value: unknown): FxQuoteSnapshot {
  const source = record(value);
  const baseRateVndPerUsdt = number(source?.baseRateVndPerUsdt, { min: 1 });
  const buySpreadPct = number(source?.buySpreadPct, { min: 0 });
  const quoteRateVndPerUsdt = number(source?.quoteRateVndPerUsdt, { min: 1 });
  const lockWindowMinutes = number(source?.lockWindowMinutes, { min: 1, integer: true });
  const version = number(source?.version, { min: 0, integer: true });
  const asOf = date(source?.asOf);
  const basisPoints = buySpreadPct === null ? null : Math.round(buySpreadPct * 100);
  const expectedQuote = baseRateVndPerUsdt === null || basisPoints === null
    ? null
    : Math.round((baseRateVndPerUsdt * (10_000 + basisPoints)) / 10_000 / 10) * 10;
  if (
    !source
    || baseRateVndPerUsdt === null
    || baseRateVndPerUsdt < 20_000
    || baseRateVndPerUsdt > 35_000
    || !Number.isInteger(baseRateVndPerUsdt)
    || buySpreadPct === null
    || buySpreadPct > 3
    || Math.abs(buySpreadPct * 100 - Math.round(buySpreadPct * 100)) > 1e-8
    || quoteRateVndPerUsdt === null
    || quoteRateVndPerUsdt !== expectedQuote
    || lockWindowMinutes === null
    || lockWindowMinutes < 5
    || lockWindowMinutes > 120
    || version === null
    || !asOf
  ) {
    throw new ApiError({ kind: "protocol", message: "FX_QUOTE_RESPONSE_INVALID" });
  }
  return {
    baseRateVndPerUsdt,
    buySpreadPct,
    quoteRateVndPerUsdt,
    lockWindowMinutes,
    version,
    asOf,
  };
}

function parseIntent(value: unknown): VietQrIntentSnapshot {
  const source = record(value);
  const account = record(source?.bankAccount);
  const intentNo = text(source?.intentNo);
  const usdtAmount = number(source?.usdtAmount, { min: Number.EPSILON });
  const fxRate = number(source?.fxRate, { min: Number.EPSILON });
  const vndAmount = number(source?.vndAmount, { min: 1 });
  const memoCode = text(source?.memoCode);
  const accountName = text(account?.accountName);
  const accountNumber = text(account?.accountNumber);
  const bankName = text(account?.bankName);
  const status = typeof source?.status === "string" && INTENT_STATUSES.has(source.status as VietQrIntentStatus)
    ? source.status as VietQrIntentStatus
    : null;
  const expiresAt = date(source?.expiresAt);
  const creditedUsdt = number(source?.creditedUsdt, { min: 0 });
  const feeVnd = number(source?.feeVnd, { min: 0 });
  const feeUsdt = number(source?.feeUsdt, { min: 0 });
  const qrPayload = source?.qrPayload === undefined ? undefined : text(source.qrPayload);
  const version = number(source?.version, { min: 0, integer: true });
  const receivedVnd = source?.receivedVnd === undefined
    ? undefined
    : number(source.receivedVnd, { min: 1 }) ?? null;
  const matchedAt = source?.matchedAt === undefined ? undefined : date(source.matchedAt);
  const createdAt = source?.createdAt === undefined ? undefined : date(source.createdAt);
  if (
    !source
    || !account
    || !intentNo
    || usdtAmount === null
    || fxRate === null
    || vndAmount === null
    || !memoCode
    || !accountName
    || !accountNumber
    || !bankName
    || !status
    || !expiresAt
    || creditedUsdt === null
    || feeVnd === null
    || feeUsdt === null
    || (source.qrPayload !== undefined && qrPayload === null)
    || version === null
    || receivedVnd === null
    || (source.matchedAt !== undefined && !matchedAt)
    || (source.createdAt !== undefined && !createdAt)
  ) {
    throw new ApiError({ kind: "protocol", message: "VIETQR_INTENT_RESPONSE_INVALID" });
  }
  return {
    intentNo,
    usdtAmount,
    fxRate,
    vndAmount,
    memoCode,
    bankAccount: { accountName, accountNumber, bankName },
    status,
    expiresAt,
    creditedUsdt,
    feeVnd,
    feeUsdt,
    ...(qrPayload ? { qrPayload } : {}),
    version,
    ...(receivedVnd === undefined ? {} : { receivedVnd }),
    ...(matchedAt ? { matchedAt } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

function parseReceipt(value: unknown): VietQrReceiptSnapshot {
  const source = record(value);
  const receiptNo = text(source?.receiptNo);
  const intentNo = text(source?.intentNo);
  const viewType = text(source?.viewType);
  const status = text(source?.status);
  const payableVnd = source?.payableVnd === null || source?.payableVnd === undefined
    ? undefined : number(source.payableVnd, { min: 0 });
  const receivedVnd = source?.receivedVnd === null || source?.receivedVnd === undefined
    ? undefined : number(source.receivedVnd, { min: 0 });
  const lockedFxRate = number(source?.lockedFxRate, { min: 1 });
  const creditedUsdt = number(source?.creditedUsdt, { min: 0 });
  const expiresAt = source?.expiresAt === null || source?.expiresAt === undefined
    ? undefined : date(source.expiresAt);
  const receivedAt = source?.receivedAt === undefined ? undefined : date(source.receivedAt);
  const createdAt = date(source?.createdAt);
  if (!source || !receiptNo || !intentNo || !viewType || !status || payableVnd === null
    || receivedVnd === null || lockedFxRate === null || creditedUsdt === null
    || (source.expiresAt !== null && source.expiresAt !== undefined && !expiresAt)
    || !createdAt || (source.receivedAt !== undefined && !receivedAt)) {
    throw new ApiError({ kind: "protocol", message: "VIETQR_RECEIPT_RESPONSE_INVALID" });
  }
  return { receiptNo, intentNo, viewType, status,
    ...(payableVnd === undefined ? {} : { payableVnd }),
    ...(receivedVnd === undefined ? {} : { receivedVnd }),
    lockedFxRate, creditedUsdt,
    ...(expiresAt ? { expiresAt } : {}), ...(receivedAt ? { receivedAt } : {}), createdAt };
}

function parseReceiptPage(value: unknown): VietQrReceiptPage {
  const source = record(value);
  const nextOffset = source?.nextOffset === null ? null : number(source?.nextOffset, { min: 0, integer: true });
  if (!source || !Array.isArray(source.items) || (source.nextOffset !== null && nextOffset === null)) {
    throw new ApiError({ kind: "protocol", message: "VIETQR_RECEIPT_RESPONSE_INVALID" });
  }
  return { items: source.items.map(parseReceipt), nextOffset: nextOffset as number | null };
}

function parseIntentList(value: unknown): VietQrIntentSnapshot[] {
  const source = record(value);
  if (!source || !Array.isArray(source.items)) {
    throw new ApiError({ kind: "protocol", message: "VIETQR_INTENT_RESPONSE_INVALID" });
  }
  return source.items.map(parseIntent);
}

export function createPaymentApi(client: ApiClient): PaymentApi {
  return {
    config: async () => parseConfig(await client.request({
      method: "GET",
      path: "/api/app/payments/config",
    })),
    fxQuote: async () => parseFxQuote(await client.request({
      method: "GET",
      path: "/api/app/payments/fx-quote?fiat=VND&asset=USDT",
    })),
    createVietQrIntent: async (usdtAmount, idempotencyKey) =>
      parseIntent(await client.request({
        method: "POST",
        path: "/api/app/deposits/vietqr/intents",
        body: { usdtAmount },
        idempotencyKey,
      })),
    listVietQrIntents: async (limit = 20) => parseIntentList(await client.request({
      method: "GET",
      path: `/api/app/deposits/vietqr/intents?limit=${Math.max(1, Math.min(50, Math.trunc(limit)))}`,
    })),
    getVietQrIntent: async (intentNo) => parseIntent(await client.request({
      method: "GET",
      path: `/api/app/deposits/vietqr/intents/${encodeURIComponent(intentNo)}`,
    })),
    cancelVietQrIntent: async (intentNo, expectedVersion, idempotencyKey) =>
      parseIntent(await client.request({
        method: "POST",
        path: `/api/app/deposits/vietqr/intents/${encodeURIComponent(intentNo)}/cancel`,
        body: { expectedVersion },
        idempotencyKey,
      })),
    listVietQrReceipts: async (limit = 20, offset = 0) => parseReceiptPage(await client.request({
      method: "GET",
      path: `/api/app/deposits/vietqr/receipts?limit=${Math.max(1, Math.min(50, Math.trunc(limit)))}&offset=${Math.max(0, Math.trunc(offset))}`,
    })),
  };
}
