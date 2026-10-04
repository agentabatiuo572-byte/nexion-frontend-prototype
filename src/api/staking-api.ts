import type { ApiClient } from "./api-client";
import { parseHistorySnapshotId, historySnapshotQuery } from "./history-snapshot";
import { parseServerTimestamp } from "./server-time";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { matchesRuntimeProvenance } from "./runtime-provenance";

export type StakingTerm = 30 | 90 | 180 | 365;
export type StakingStatus =
  | "pending-lock"
  | "active"
  | "matured"
  | "claimed"
  | "early-withdrawn"
  | "slashed"
  | "refunded";

export interface StakingPool {
  poolId: number;
  tierKey: string;
  currency: "USDT";
  termDays: StakingTerm;
  apy: number;
  penalty: number;
  minAmountUsdt: number;
  enabled: boolean;
  killed: boolean;
  status: "ACTIVE" | "STOPPED" | "KILLED";
  sourceEnvironment?: "PRODUCTION" | "SANDBOX";
  runId?: string;
}

export interface StakingPosition {
  id: string;
  tierKey: string;
  productCode: string;
  productName: string;
  amountUSDT: number;
  termDays: StakingTerm;
  apy: number;
  penalty: number;
  startTs: number;
  unlockTs: number;
  estimatedInterestUsdt: number;
  status: StakingStatus;
}

export interface StakingSnapshot {
  positions: StakingPosition[];
  positionsPage: { total: number; pageNum: number; pageSize: number; snapshotId?: string };
  walletBalanceUsdt: number;
  serverTime: number;
  position?: StakingPosition;
  principalUsdt?: number;
  interestUsdt?: number;
  penaltyUsdt?: number;
  creditedUsdt?: number;
  billNo?: string;
  receiptId?: string;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface StakingApi {
  fetchStakingPools(): Promise<StakingPool[]>;
  fetchStakingPositions(): Promise<StakingSnapshot>;
  openStakingPosition(tierKey: string, amountUsdt: number, idempotencyKey: string): Promise<StakingSnapshot>;
  claimStakingPosition(positionNo: string, idempotencyKey: string): Promise<StakingSnapshot>;
  earlyWithdrawStakingPosition(positionNo: string, idempotencyKey: string): Promise<StakingSnapshot>;
}

const TERMS = new Set<number>([30, 90, 180, 365]);
const TIER_BY_TERM: Record<StakingTerm, string> = {
  30: "usdt30d",
  90: "usdt90d",
  180: "usdt180d",
  365: "usdt365d",
};

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

function integer(value: unknown, min = 0): number | null {
  const parsed = number(value, min);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function timestamp(value: unknown): number | null {
  return parseServerTimestamp(value);
}

function canonicalStatus(value: unknown): StakingStatus | null {
  switch (text(value)?.toUpperCase()) {
    case "PENDING_LOCK": return "pending-lock";
    case "ACTIVE": return "active";
    case "MATURE_UNCLAIMED": return "matured";
    case "CLAIMED": return "claimed";
    case "EARLY_WITHDRAWN": return "early-withdrawn";
    case "SLASHED": return "slashed";
    case "REFUNDED": return "refunded";
    default: return null;
  }
}

function parsePool(value: unknown, source: { sourceEnvironment: "PRODUCTION" | "SANDBOX"; runId: string }): StakingPool {
  const row = record(value);
  const poolId = integer(row?.poolId, 1);
  const tierKey = text(row?.tierKey)?.toLowerCase() ?? null;
  const termDays = integer(row?.termDays, 1);
  const apyPct = number(row?.apyPct);
  const penaltyPct = number(row?.penaltyPct);
  const minAmountUsdt = number(row?.minAmountUsdt, Number.EPSILON);
  const status = text(row?.status)?.toUpperCase();
  if (!row || poolId === null || !tierKey || termDays === null || !TERMS.has(termDays)
      || TIER_BY_TERM[termDays as StakingTerm] !== tierKey || row.currency !== "USDT"
      || apyPct === null || apyPct > 300 || penaltyPct === null || penaltyPct > 100
      || minAmountUsdt === null || typeof row.enabled !== "boolean" || typeof row.killed !== "boolean"
      || !["ACTIVE", "STOPPED", "KILLED"].includes(status ?? "")
      || (row.killed && status !== "KILLED")
      || (!row.enabled && !row.killed && status !== "STOPPED")) {
    return invalid("STAKING_POOLS_RESPONSE_INVALID");
  }
  return {
    poolId,
    tierKey,
    currency: "USDT",
    termDays: termDays as StakingTerm,
    apy: apyPct / 100,
    penalty: penaltyPct / 100,
    minAmountUsdt,
    enabled: row.enabled,
    killed: row.killed,
    status: status as StakingPool["status"],
    sourceEnvironment: source.sourceEnvironment,
    runId: source.runId,
  };
}

function parsePools(value: unknown, mode: ApiEnvironment): StakingPool[] {
  const row = record(value);
  const source = row && matchesRuntimeProvenance(row, mode,
    "nx_staking_product + nx_config_item + nx_emergency_control_setting")
    ? { sourceEnvironment: row.sourceEnvironment, runId: row.runId } : null;
  if (!row || !source || row.serverCanonical !== true
      || !Array.isArray(row.pools) || row.pools.length !== 4) {
    return invalid("STAKING_POOLS_RESPONSE_INVALID");
  }
  const pools = row.pools.map((pool) => parsePool(pool, source)).sort((a, b) => a.termDays - b.termDays);
  const terms = pools.map((pool) => pool.termDays);
  const ids = pools.map((pool) => pool.poolId);
  if (new Set(terms).size !== 4 || new Set(ids).size !== 4 || terms.join(",") !== "30,90,180,365") {
    return invalid("STAKING_POOLS_RESPONSE_INVALID");
  }
  return pools;
}

function parsePosition(value: unknown): StakingPosition {
  const row = record(value);
  const id = text(row?.positionNo);
  const tierKey = text(row?.tierKey)?.toLowerCase() ?? null;
  const productCode = text(row?.productCode);
  const productName = text(row?.productName);
  const amountUSDT = number(row?.amountUsdt, Number.EPSILON);
  const termDays = integer(row?.termDays, 1);
  const apyPct = number(row?.apyPct);
  const penaltyPct = number(row?.penaltyPct);
  const startTs = timestamp(row?.lockedAt);
  const unlockTs = timestamp(row?.unlockAt);
  const estimatedInterestUsdt = number(row?.estimatedInterestUsdt);
  const status = canonicalStatus(row?.status);
  if (!row || !id || !tierKey || !productCode || !productName || amountUSDT === null
      || termDays === null || !TERMS.has(termDays) || TIER_BY_TERM[termDays as StakingTerm] !== tierKey
      || apyPct === null || apyPct > 300 || penaltyPct === null || penaltyPct > 100
      || startTs === null || unlockTs === null || unlockTs <= startTs
      || estimatedInterestUsdt === null || !status) {
    return invalid("STAKING_POSITIONS_RESPONSE_INVALID");
  }
  return {
    id,
    tierKey,
    productCode,
    productName,
    amountUSDT,
    termDays: termDays as StakingTerm,
    apy: apyPct / 100,
    penalty: penaltyPct / 100,
    startTs,
    unlockTs,
    estimatedInterestUsdt,
    status,
  };
}

function optionalMoney(row: Record<string, unknown>, key: string): number | undefined {
  if (!(key in row) || row[key] === null) return undefined;
  const value = number(row[key]);
  if (value === null) return invalid("STAKING_POSITIONS_RESPONSE_INVALID");
  return value;
}

function optionalText(row: Record<string, unknown>, key: string): string | undefined {
  if (!(key in row) || row[key] === null) return undefined;
  const value = text(row[key]);
  if (!value) return invalid("STAKING_POSITIONS_RESPONSE_INVALID");
  return value;
}

function parseSnapshot(value: unknown, mode: ApiEnvironment): StakingSnapshot {
  const row = record(value);
  const walletBalanceUsdt = number(row?.walletBalanceUsdt);
  const serverTime = timestamp(row?.serverTime);
  const expectedSource = "nx_staking_product + nx_config_item + nx_emergency_control_setting";
  if (!row || row.serverCanonical !== true || !matchesRuntimeProvenance(row, mode, expectedSource)
      || !Array.isArray(row.positions)
      || walletBalanceUsdt === null || serverTime === null) {
    return invalid("STAKING_POSITIONS_RESPONSE_INVALID");
  }
  const positions = row.positions.map(parsePosition);
  const page = record(row.positionsPage);
  const total = integer(page?.total);
  const pageNum = integer(page?.pageNum, 1);
  const pageSize = integer(page?.pageSize, 1);
  if (new Set(positions.map((position) => position.id)).size !== positions.length) {
    return invalid("STAKING_POSITIONS_RESPONSE_INVALID");
  }
  if (!page || total === null || pageNum === null || pageSize === null
      || positions.length > pageSize || positions.length > total) {
    return invalid("STAKING_POSITIONS_RESPONSE_INVALID");
  }
  return {
    positions,
    positionsPage: { total, pageNum, pageSize, snapshotId: parseHistorySnapshotId(page.snapshotId) },
    walletBalanceUsdt,
    serverTime,
    position: row.position === undefined ? undefined : parsePosition(row.position),
    principalUsdt: optionalMoney(row, "principalUsdt"),
    interestUsdt: optionalMoney(row, "interestUsdt"),
    penaltyUsdt: optionalMoney(row, "penaltyUsdt"),
    creditedUsdt: optionalMoney(row, "creditedUsdt"),
    billNo: optionalText(row, "billNo"),
    receiptId: optionalText(row, "receiptId"),
    sourceEnvironment: row.sourceEnvironment,
    runId: row.runId,
  };
}

export function createStakingApi(client: ApiClient, mode: ApiEnvironment = "prod"): StakingApi {
  const fetchAllPositions = async (): Promise<StakingSnapshot> => {
    const first = parseSnapshot(await client.request({ method: "GET", path: "/api/stakes?pageNum=1&pageSize=50" }), mode);
    if (first.positionsPage.pageNum !== 1 || first.positionsPage.pageSize !== 50) {
      return invalid("STAKING_POSITIONS_PAGINATION_INVALID");
    }
    const positions = [...first.positions];
    const ids = new Set(positions.map((position) => position.id));
    let pageNum = first.positionsPage.pageNum;
    while (positions.length < first.positionsPage.total) {
      pageNum += 1;
      const next = parseSnapshot(await client.request({
        method: "GET",
        path: `/api/stakes?pageNum=${pageNum}&pageSize=${first.positionsPage.pageSize}${historySnapshotQuery(first.positionsPage.snapshotId)}`,
      }), mode);
      if (next.positionsPage.snapshotId !== first.positionsPage.snapshotId || next.positionsPage.pageNum !== pageNum || next.positionsPage.total !== first.positionsPage.total
          || next.positionsPage.pageSize !== first.positionsPage.pageSize || next.positions.length === 0) {
        return invalid("STAKING_POSITIONS_PAGINATION_INVALID");
      }
      for (const position of next.positions) {
        if (ids.has(position.id)) return invalid("STAKING_POSITIONS_PAGINATION_INVALID");
        ids.add(position.id);
        positions.push(position);
      }
    }
    return { ...first, positions, positionsPage: { ...first.positionsPage, pageNum } };
  };
  return {
    fetchStakingPools: async () => parsePools(await client.request({
      method: "GET",
      path: "/api/config/staking/pools",
      authenticated: false,
    }), mode),
    fetchStakingPositions: fetchAllPositions,
    openStakingPosition: async (tierKey, amountUsdt, idempotencyKey) =>
      parseSnapshot(await client.request({
        method: "POST",
        path: "/api/stakes",
        body: { tierKey, amountUsdt },
        idempotencyKey,
        timeoutMs: 30_000,
      }), mode),
    claimStakingPosition: async (positionNo, idempotencyKey) =>
      parseSnapshot(await client.request({
        method: "POST",
        path: `/api/stakes/${encodeURIComponent(positionNo)}/claim`,
        idempotencyKey,
        timeoutMs: 30_000,
      }), mode),
    earlyWithdrawStakingPosition: async (positionNo, idempotencyKey) =>
      parseSnapshot(await client.request({
        method: "POST",
        path: `/api/stakes/${encodeURIComponent(positionNo)}/early-withdraw`,
        idempotencyKey,
        timeoutMs: 30_000,
      }), mode),
  };
}
