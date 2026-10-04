import type { ApiClient } from "./api-client";
import type { TrialStatus } from "../store/trial-boundary";

export type TrialEligibilityReason =
  "in-progress" | "converted" | "used" | "phase-closed" | "quota-exhausted" | "risk" | "product-unavailable" | "unknown";
export type TrialConfigValue = string | boolean;

export interface TrialAuthorityState {
  authoritative: true;
  serverState: "ELIGIBLE" | "ACTIVE" | "GRACE" | "EXTENDED" | "REDEEMED" | "FAILED" | "CANCELLED";
  status: TrialStatus;
  canStart: boolean;
  eligibilityReason?: TrialEligibilityReason;
  claimNo: string | null;
  version: number;
  serverNow: number;
  startedAt: number | null;
  expiresAt: number | null;
  graceEndsAt: number | null;
  extendedEndsAt?: number | null;
  finishedAt: number | null;
  cooldownUntil: number | null;
  shadowUSD: number;
  shadowNEX: number;
  source: string;
  serverCanonical: true;
  sourceEnvironment: "PRODUCTION";
  runId: "";
  provenance: {
    serverCanonical: true;
    source: string;
    sourceEnvironment: "PRODUCTION";
    runId: "";
  };
  paymentRail: "NEXION_USDT_WALLET";
  config: Record<string, TrialConfigValue>;
}

export interface TrialConvertReceipt {
  orderNo: string;
  paymentNo?: string;
  productNo: string;
  amountUsdt: number;
  discountUsdt: number;
  paymentStatus: "PENDING" | "PAID";
  orderStatus: "PENDING_PAYMENT" | "PAID";
  source: "nx_trial_claim + nx_order + nx_order_item";
  serverCanonical: true;
  sourceEnvironment: "PRODUCTION";
  runId: "";
  provenance: {
    source: "nx_trial_claim + nx_order + nx_order_item";
    serverCanonical: true;
    sourceEnvironment: "PRODUCTION";
    runId: "";
  };
}

/**
 * 🔴 转化(用抵扣金购机)故意**不在**本接口层。当前 PRD §9.11a.2 的转化端点是
 * `POST /api/trial/convert` returns a server-created pending order receipt;
 * the store reads `/api/trial/state` again before presenting success.
 */
export interface TrialApi {
  state(): Promise<TrialAuthorityState>;
  eligibility(): Promise<TrialAuthorityState>;
  start(idempotencyKey: string, deviceName: string): Promise<TrialAuthorityState>;
  convert(productNo: string, expectedAmountUsdt: number | null, idempotencyKey: string): Promise<TrialConvertReceipt>;
  cancel(reason: "explicit" | "unbind", idempotencyKey: string): Promise<TrialAuthorityState>;
}

const SERVER_STATES = new Set([
  "ELIGIBLE", "ACTIVE", "GRACE", "EXTENDED", "REDEEMED", "FAILED", "CANCELLED",
]);
const REASONS = new Set([
  "in-progress", "converted", "used", "phase-closed", "quota-exhausted", "risk", "product-unavailable", "unknown",
]);

function invalid(): never {
  throw new Error("TRIAL_RESPONSE_INVALID");
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown, min = 0): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : null;
}

function timestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : invalid();
}

export function parseTrialConvertReceipt(value: unknown): TrialConvertReceipt {
  const row = record(value);
  const orderNo = typeof row?.orderNo === "string" ? row.orderNo.trim() : "";
  const productNo = typeof row?.productNo === "string" ? row.productNo.trim() : "";
  const amountUsdt = finiteNumber(row?.amountUsdt);
  const discountUsdt = finiteNumber(row?.discountUsdt);
  const paymentStatus = row?.paymentStatus === "PAID" ? "PAID" : row?.paymentStatus === "PENDING" ? "PENDING" : null;
  const orderStatus = row?.orderStatus === "PAID" ? "PAID" : row?.orderStatus === "PENDING_PAYMENT" ? "PENDING_PAYMENT" : null;
  const source = row?.source === "nx_trial_claim + nx_order + nx_order_item" ? row.source : null;
  const provenance = record(row?.provenance);
  const paymentNo = row?.paymentNo == null ? undefined : String(row.paymentNo).trim();
  if (!/^TRC-[A-Z0-9]+$/.test(orderNo) || !productNo || amountUsdt === null || discountUsdt === null
      || !paymentStatus || !orderStatus || !source
      || row?.serverCanonical !== true || row?.sourceEnvironment !== "PRODUCTION" || row?.runId !== ""
      || provenance?.serverCanonical !== true || provenance.source !== source
      || provenance.sourceEnvironment !== "PRODUCTION" || provenance.runId !== "") return invalid();
  return { orderNo, ...(paymentNo ? { paymentNo } : {}), productNo, amountUsdt, discountUsdt,
    paymentStatus, orderStatus, source, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
    provenance: { source, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" } };
}

function clientStatus(serverState: TrialAuthorityState["serverState"]): TrialStatus {
  switch (serverState) {
    case "ELIGIBLE": return "none";
    case "ACTIVE": return "active";
    case "GRACE":
    case "EXTENDED": return "grace";
    case "REDEEMED": return "converted";
    case "FAILED":
    case "CANCELLED": return "ended";
  }
}

function trialConfig(value: unknown): Record<string, TrialConfigValue> {
  const source = record(value);
  if (!source) return invalid();
  const result: Record<string, TrialConfigValue> = {};
  for (const [key, item] of Object.entries(source)) {
    if ((typeof item !== "string" && typeof item !== "boolean") || !key.trim()) return invalid();
    result[key] = item;
  }
  return result;
}

export function parseTrialAuthorityState(value: unknown): TrialAuthorityState {
  const row = record(value);
  const rawState = typeof row?.state === "string" ? row.state.trim().toUpperCase() : "";
  if (!row || row.authoritative !== true || !SERVER_STATES.has(rawState)) return invalid();
  const serverState = rawState as TrialAuthorityState["serverState"];
  const canStart = row.canStart;
  const serverNow = finiteNumber(row.serverNowEpochMs, 1);
  const version = finiteNumber(row.version);
  const source = row.source === "nx_trial_claim" || row.source === "nx_trial_claim + nx_user_wallet"
    ? row.source : null;
  const provenance = record(row.provenance);
  const reason = row.eligibilityReason == null ? undefined : String(row.eligibilityReason);
  const claimNo = row.claimNo == null ? null : String(row.claimNo).trim();
  const shadowUSD = finiteNumber(row.shadowUsdt ?? 0);
  const shadowNEX = finiteNumber(row.shadowNex ?? 0);
  if (typeof canStart !== "boolean" || serverNow === null || version === null || !Number.isInteger(version)
      || !source || row.serverCanonical !== true || row.sourceEnvironment !== "PRODUCTION" || row.runId !== ""
      || provenance?.serverCanonical !== true || provenance.source !== source
      || provenance.sourceEnvironment !== "PRODUCTION" || provenance.runId !== ""
      || row.paymentRail !== "NEXION_USDT_WALLET"
      || (reason !== undefined && !REASONS.has(reason))
      || (canStart && reason !== undefined)
      || (!canStart && reason === undefined)
      || (["ACTIVE", "GRACE", "EXTENDED", "REDEEMED"].includes(serverState) && canStart)
      || (serverState !== "ELIGIBLE" && !claimNo)
      || shadowUSD === null || shadowNEX === null) return invalid();

  const startedAt = timestamp(row.claimedAtEpochMs ?? row.claimedAt);
  const expiresAt = timestamp(row.expiresAtEpochMs ?? row.expiresAt);
  const graceEndsAt = timestamp(row.graceEndsAtEpochMs ?? row.graceEndsAt);
  const extendedEndsAt = timestamp(row.extendedEndsAtEpochMs ?? row.extendedEndsAt);
  if (serverState === "EXTENDED" && extendedEndsAt === null) return invalid();
  const finishedAt = timestamp(row.finishedAtEpochMs ?? row.finishedAt);
  const cooldownUntil = timestamp(row.cooldownUntilEpochMs ?? row.cooldownUntil);
  if (["ACTIVE", "GRACE", "EXTENDED", "REDEEMED"].includes(serverState)
      && (startedAt === null || expiresAt === null)) return invalid();

  return {
    authoritative: true,
    serverState,
    status: clientStatus(serverState),
    canStart,
    ...(reason ? { eligibilityReason: reason as TrialEligibilityReason } : {}),
    claimNo,
    version,
    serverNow,
    startedAt,
    expiresAt,
    graceEndsAt,
    extendedEndsAt,
    finishedAt,
    cooldownUntil,
    shadowUSD,
    shadowNEX,
    source,
    serverCanonical: true,
    sourceEnvironment: "PRODUCTION",
    runId: "",
    provenance: {
      serverCanonical: true,
      source,
      sourceEnvironment: "PRODUCTION",
      runId: "",
    },
    paymentRail: "NEXION_USDT_WALLET",
    config: trialConfig(row.config),
  };
}

export function createTrialApi(client: ApiClient): TrialApi {
  const parse = async (request: Parameters<ApiClient["request"]>[0]) =>
    parseTrialAuthorityState(await client.request(request));
  return {
    state: () => parse({ method: "GET", path: "/api/trial/state" }),
    eligibility: () => parse({ method: "GET", path: "/api/trial/eligibility" }),
    start: (idempotencyKey, deviceName) => parse({
      method: "POST",
      path: "/api/trial/start",
      body: { deviceName },
      idempotencyKey,
    }),
    convert: async (productNo, expectedAmountUsdt, idempotencyKey) => parseTrialConvertReceipt(await client.request({
      method: "POST",
      path: "/api/trial/convert",
      body: { productNo, expectedAmountUsdt },
      idempotencyKey,
    })),
    cancel: (reason, idempotencyKey) => parse({
      method: "POST",
      path: "/api/trial/cancel",
      body: { reason },
      idempotencyKey,
    }),
  };
}
