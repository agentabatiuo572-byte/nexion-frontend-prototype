import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type FundsSandboxTopupChannel = "CREGIS_USDT_BEP20" | "VIETQR" | "CARD";
export type FundsSandboxOrderStatus = "PENDING" | "SETTLED" | "SUBMITTED" | "CONFIRMED" | "FAILED";

export interface FundsSandboxWallet {
  availableUsdt: number;
  reservedUsdt: number;
  version: number;
  source: "mock";
  sourceEnvironment: "SANDBOX";
}

export interface FundsSandboxOrder {
  runId: string;
  orderNo: string;
  kind: "TOPUP" | "WITHDRAWAL";
  channel: FundsSandboxTopupChannel;
  amount: number;
  targetAddress: string | null;
  status: FundsSandboxOrderStatus;
  source: "mock";
  sourceEnvironment: "SANDBOX";
  version: number;
  createdAt: string;
  settledAt: string | null;
  wallet?: FundsSandboxWallet;
}

export interface FundsSandboxLedgerEntry {
  runId: string;
  ledgerNo: string;
  orderNo: string;
  entryRole: string;
  direction: "IN" | "OUT" | "RESERVE" | "RELEASE";
  amount: number;
  availableAfter: number;
  reservedAfter: number;
  source: "mock";
  sourceEnvironment: "SANDBOX";
  createdAt: string;
}

/**
 * The withdrawal policy is deliberately carried by the same authenticated
 * sandbox-wallet response as the usable balance. It must never be inferred
 * from the production withdrawal policy: the isolated test rail is allowed
 * only when this exact server declaration is present and self-consistent.
 */
export interface FundsSandboxWithdrawalPolicy {
  minAmount: number;
  dailyLimitCount: number;
  balanceMaxRatio: number;
  smallAmountThresholdUsd: number;
  payoutSlaHours: number;
  networkConfirmFeeUsd: Record<"trc20" | "bep20" | "erc20", number>;
  nexFeeOffsetRate: number;
  policyVersion: string;
  cooldownDays: number;
  complianceHoldEnabled: false;
  withdrawalEnabled: true;
  enabledNetworks: ["USDT-BEP20"];
  network: "USDT-BEP20";
  channel: "CREGIS_USDT_BEP20";
  source: "mock";
  sourceEnvironment: "SANDBOX";
  mode: "LOCAL_SANDBOX";
}

export interface FundsSandboxOverview {
  runId: string;
  wallet: FundsSandboxWallet;
  orders: FundsSandboxOrder[];
  ledger: FundsSandboxLedgerEntry[];
  withdrawalPolicy: FundsSandboxWithdrawalPolicy;
  source: "mock";
  sourceEnvironment: "SANDBOX";
  mode: "LOCAL_SANDBOX";
}

/**
 * This is deliberately derived from a parsed GET overview, never from a build
 * flag or browser storage. UI surfaces can only disclose the sandbox after the
 * server has supplied all three matching provenance fields.
 */
export interface FundsSandboxEvidence {
  source: "mock";
  sourceEnvironment: "SANDBOX";
  mode: "LOCAL_SANDBOX";
  withdrawalPolicy: FundsSandboxWithdrawalPolicy;
}

export function sandboxEvidenceFromOverview(overview: FundsSandboxOverview): FundsSandboxEvidence {
  return {
    source: overview.source,
    sourceEnvironment: overview.sourceEnvironment,
    mode: overview.mode,
    withdrawalPolicy: overview.withdrawalPolicy,
  };
}

export interface FundsSandboxApi {
  overview(): Promise<FundsSandboxOverview>;
  createTopup(channel: FundsSandboxTopupChannel, amount: number, idempotencyKey: string): Promise<FundsSandboxOrder>;
  createWithdrawal(amount: number, targetAddress: string, idempotencyKey: string): Promise<FundsSandboxOrder>;
  applyCallback(orderNo: string, status: "CONFIRMED" | "FAILED", expectedVersion: number, eventId: string): Promise<FundsSandboxOrder>;
}

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const amount = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const integer = (value: unknown): number | null => {
  const parsed = amount(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
};

function assertSource(row: Record<string, unknown> | null): asserts row is Record<string, unknown> {
  if (!row || row.source !== "mock" || row.sourceEnvironment !== "SANDBOX") {
    throw new ApiError({ kind: "protocol", message: "FUNDS_SANDBOX_SOURCE_INVALID" });
  }
}

function wallet(value: unknown): FundsSandboxWallet {
  const row = object(value);
  assertSource(row);
  const availableUsdt = amount(row.availableUsdt);
  const reservedUsdt = amount(row.reservedUsdt);
  const version = integer(row.version);
  if (availableUsdt === null || reservedUsdt === null || version === null) {
    throw new ApiError({ kind: "protocol", message: "FUNDS_SANDBOX_WALLET_INVALID" });
  }
  return { availableUsdt, reservedUsdt, version, source: "mock", sourceEnvironment: "SANDBOX" };
}

function order(value: unknown): FundsSandboxOrder {
  const row = object(value);
  assertSource(row);
  const orderNo = text(row.orderNo);
  const runId = text(row.runId);
  const kind = row.kind;
  const channel = row.channel;
  const valueAmount = amount(row.amount);
  const status = row.status;
  const version = integer(row.version);
  const createdAt = text(row.createdAt);
  const settledAt = row.settledAt === null ? null : text(row.settledAt);
  const targetAddress = row.targetAddress === null ? null : text(row.targetAddress);
  if (!runId || !orderNo || !["TOPUP", "WITHDRAWAL"].includes(String(kind))
      || !["CREGIS_USDT_BEP20", "VIETQR", "CARD"].includes(String(channel))
      || valueAmount === null || valueAmount <= 0
      || !["PENDING", "SETTLED", "SUBMITTED", "CONFIRMED", "FAILED"].includes(String(status))
      || version === null || !createdAt || !Number.isFinite(Date.parse(createdAt))
      || (settledAt !== null && (!settledAt || !Number.isFinite(Date.parse(settledAt))))
      || (kind === "WITHDRAWAL" && !targetAddress)) {
    throw new ApiError({ kind: "protocol", message: "FUNDS_SANDBOX_ORDER_INVALID" });
  }
  return {
    runId,
    orderNo,
    kind: kind as FundsSandboxOrder["kind"],
    channel: channel as FundsSandboxTopupChannel,
    amount: valueAmount,
    targetAddress,
    status: status as FundsSandboxOrderStatus,
    source: "mock",
    sourceEnvironment: "SANDBOX",
    version,
    createdAt,
    settledAt,
    ...(row.wallet ? { wallet: wallet(row.wallet) } : {}),
  };
}

function ledger(value: unknown): FundsSandboxLedgerEntry {
  const row = object(value);
  assertSource(row);
  const ledgerNo = text(row.ledgerNo);
  const runId = text(row.runId);
  const orderNo = text(row.orderNo);
  const entryRole = text(row.entryRole);
  const direction = row.direction;
  const valueAmount = amount(row.amount);
  const availableAfter = amount(row.availableAfter);
  const reservedAfter = amount(row.reservedAfter);
  const createdAt = text(row.createdAt);
  if (!runId || !ledgerNo || !orderNo || !entryRole || !["IN", "OUT", "RESERVE", "RELEASE"].includes(String(direction))
      || valueAmount === null || availableAfter === null || reservedAfter === null
      || !createdAt || !Number.isFinite(Date.parse(createdAt))) {
    throw new ApiError({ kind: "protocol", message: "FUNDS_SANDBOX_LEDGER_INVALID" });
  }
  return { runId, ledgerNo, orderNo, entryRole, direction: direction as FundsSandboxLedgerEntry["direction"], amount: valueAmount,
    availableAfter, reservedAfter, source: "mock", sourceEnvironment: "SANDBOX", createdAt };
}

function withdrawalPolicy(value: unknown): FundsSandboxWithdrawalPolicy {
  const row = object(value);
  assertSource(row);
  const minAmount = amount(row?.minAmount);
  const dailyLimitCount = integer(row?.dailyLimitCount);
  const balanceMaxRatio = amount(row?.balanceMaxRatio);
  const smallAmountThresholdUsd = amount(row?.smallAmountThresholdUsd);
  const payoutSlaHours = integer(row?.payoutSlaHours);
  const networkFees = object(row?.networkConfirmFeeUsd);
  const trc20 = amount(networkFees?.trc20);
  const bep20 = amount(networkFees?.bep20);
  const erc20 = amount(networkFees?.erc20);
  const nexFeeOffsetRate = amount(row?.nexFeeOffsetRate);
  const policyVersion = text(row?.policyVersion);
  const cooldownDays = integer(row?.cooldownDays);
  const enabledNetworks = row?.enabledNetworks;
  if (!row || row.mode !== "LOCAL_SANDBOX"
      || minAmount === null || minAmount <= 0
      || dailyLimitCount === null || dailyLimitCount < 1
      || balanceMaxRatio === null || balanceMaxRatio <= 0 || balanceMaxRatio > 1
      || smallAmountThresholdUsd === null || smallAmountThresholdUsd > 500
      || payoutSlaHours === null || payoutSlaHours < 1 || payoutSlaHours > 168
      || trc20 === null || bep20 === null || erc20 === null
      || trc20 > 25 || bep20 > 25 || erc20 > 25
      || nexFeeOffsetRate === null || nexFeeOffsetRate <= 0
      || !policyVersion || cooldownDays === null || cooldownDays < 1
      || row.complianceHoldEnabled !== false || row.withdrawalEnabled !== true
      || !Array.isArray(enabledNetworks) || enabledNetworks.length !== 1 || enabledNetworks[0] !== "USDT-BEP20"
      || row.network !== "USDT-BEP20" || row.channel !== "CREGIS_USDT_BEP20") {
    throw new ApiError({ kind: "protocol", message: "FUNDS_SANDBOX_WITHDRAWAL_POLICY_INVALID" });
  }
  return {
    minAmount,
    dailyLimitCount,
    balanceMaxRatio,
    smallAmountThresholdUsd,
    payoutSlaHours,
    networkConfirmFeeUsd: { trc20, bep20, erc20 },
    nexFeeOffsetRate,
    policyVersion,
    cooldownDays,
    complianceHoldEnabled: false,
    withdrawalEnabled: true,
    enabledNetworks: ["USDT-BEP20"],
    network: "USDT-BEP20",
    channel: "CREGIS_USDT_BEP20",
    source: "mock",
    sourceEnvironment: "SANDBOX",
    mode: "LOCAL_SANDBOX",
  };
}

function overview(value: unknown): FundsSandboxOverview {
  const row = object(value);
  assertSource(row);
  const runId = text(row.runId);
  if (!runId || row.mode !== "LOCAL_SANDBOX" || !Array.isArray(row.orders) || !Array.isArray(row.ledger)) {
    throw new ApiError({ kind: "protocol", message: "FUNDS_SANDBOX_OVERVIEW_INVALID" });
  }
  const orders = row.orders.map(order);
  const entries = row.ledger.map(ledger);
  if (orders.some((item) => item.runId !== runId) || entries.some((item) => item.runId !== runId)) {
    throw new ApiError({ kind: "protocol", message: "FUNDS_SANDBOX_RUN_ID_MISMATCH" });
  }
  return { runId, wallet: wallet(row.wallet), orders, ledger: entries, withdrawalPolicy: withdrawalPolicy(row.withdrawalPolicy),
    source: "mock", sourceEnvironment: "SANDBOX", mode: "LOCAL_SANDBOX" };
}

export function createFundsSandboxApi(client: ApiClient): FundsSandboxApi {
  return {
    overview: async () => overview(await client.request({ method: "GET", path: "/api/app/wallet/sandbox" })),
    createTopup: async (channel, value, idempotencyKey) => order(await client.request({
      method: "POST", path: "/api/app/wallet/sandbox/topups", body: { channel, amount: value }, idempotencyKey,
    })),
    createWithdrawal: async (value, targetAddress, idempotencyKey) => order(await client.request({
      method: "POST", path: "/api/app/wallet/sandbox/withdrawals",
      body: { channel: "CREGIS_USDT_BEP20", amount: value, targetAddress }, idempotencyKey,
    })),
    applyCallback: async (orderNo, status, expectedVersion, eventId) => order(await client.request({
      method: "POST", path: `/api/app/wallet/sandbox/orders/${encodeURIComponent(orderNo)}/callbacks`,
      body: { eventId, status, expectedVersion },
    })),
  };
}
