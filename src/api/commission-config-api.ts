import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiResponseEnvironment } from "./runtime-config";
import { isCurrentCommerceSandboxRun } from "./order-api";

export type CommissionSourceEnvironment = "PRODUCTION" | "SANDBOX";

export interface CanonicalCommissionConfig {
  source: string;
  unilevelUsdt: Record<number, number>;
  unilevelNex: Record<number, number>;
  partnerThresholds: {
    standard: number;
    verified: number;
    premium: number;
    diamond: number;
  };
  influenceClampMin: number;
  influenceClampMax: number;
  coolingDays: number;
  promoMultiplier: number;
}

export type CanonicalBinarySettlePeriod = "daily" | "weekly" | "monthly";
export type CanonicalBinaryResidualPolicy = "monthlyClear" | "perPairClear" | "carryForward";

export interface CanonicalBinaryMatch {
  id: string;
  amountUsdt: number;
  status: "cooling" | "unlocked" | "withdrawn";
  createdAt: number;
  unlockAt: number;
}

export interface CanonicalBinaryState {
  source: string;
  serverCanonical: true;
  sourceEnvironment: CommissionSourceEnvironment;
  runId: string | null;
  asOfDate: string;
  trackA: number;
  trackB: number;
  trackAMembers: number;
  trackBMembers: number;
  autoPlacedMembers: number;
  matchRate: number;
  threshold: number;
  dailyCap: number;
  periodCap: number;
  estimatedAmountUsdt: number;
  settlePeriod: CanonicalBinarySettlePeriod;
  residualPolicy: CanonicalBinaryResidualPolicy;
  spilloverEnabled: boolean;
  gvReset: string;
  paused: boolean;
  blockedReason: string;
  recentMatches: CanonicalBinaryMatch[];
}

export interface CommissionConfigApi {
  rates(): Promise<CanonicalCommissionConfig>;
  binary(): Promise<CanonicalBinaryState>;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "COMMISSION_CONFIG_RESPONSE_INVALID" });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === "string" && value.trim() ? Number(value.replace(/[^\d.-]/g, "")) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < min || parsed > max) return invalid();
  return parsed;
}

function integer(value: unknown, min = 0): number {
  const parsed = number(value, min);
  if (!Number.isInteger(parsed)) return invalid();
  return parsed;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value.trim();
}

function isoDate(value: unknown): string {
  const parsed = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return invalid();
  return parsed;
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(text(value));
  if (!Number.isFinite(parsed)) return invalid();
  return parsed;
}

function id(value: unknown): string {
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) return invalid();
  return String(value).trim();
}

function parsePartnerThresholds(value: unknown): CanonicalCommissionConfig["partnerThresholds"] {
  let source: Record<string, unknown>;
  try {
    source = record(typeof value === "string" ? JSON.parse(value) : value);
  } catch {
    return invalid();
  }
  const thresholds = {
    standard: number(source.standard ?? source.bronze),
    verified: number(source.verified ?? source.silver),
    premium: number(source.premium ?? source.gold),
    diamond: number(source.diamond),
  };
  if (thresholds.standard > thresholds.verified
      || thresholds.verified > thresholds.premium
      || thresholds.premium > thresholds.diamond) return invalid();
  return thresholds;
}

function parse(value: unknown): CanonicalCommissionConfig {
  const source = record(value);
  if (typeof source.source !== "string" || !source.source.trim() || !Array.isArray(source.unilevel)) return invalid();
  const unilevelUsdt: Record<number, number> = {};
  const unilevelNex: Record<number, number> = {};
  for (const raw of source.unilevel) {
    const row = record(raw);
    const match = typeof row.level === "string" ? /^L([1-7])$/.exec(row.level) : null;
    if (!match) return invalid();
    const layer = Number(match[1]);
    if (unilevelUsdt[layer] !== undefined) return invalid();
    unilevelUsdt[layer] = number(row.usdtPct, 0, 25) / 100;
    unilevelNex[layer] = number(row.nexReward, 0);
  }
  if (Object.keys(unilevelUsdt).length !== 7) return invalid();
  if (Math.abs(unilevelUsdt[1] - 0.1) > 0.0000001) return invalid();
  const totalPct = Object.values(unilevelUsdt).reduce((sum, rate) => sum + rate, 0) * 100;
  if (totalPct > 25.000001) return invalid();
  const influenceClampMin = number(source.influenceClampMin, 1, 5);
  const influenceClampMax = number(source.influenceClampMax, 1, 5);
  if (influenceClampMin > influenceClampMax) return invalid();
  return {
    source: source.source.trim(),
    unilevelUsdt,
    unilevelNex,
    partnerThresholds: parsePartnerThresholds(source.partnerTiersJson),
    influenceClampMin,
    influenceClampMax,
    coolingDays: number(source.coolingDays, 0, 90),
    promoMultiplier: number(source.promoMultiplier, 1, 3),
  };
}

function binaryStatus(value: unknown): CanonicalBinaryMatch["status"] {
  const status = text(value).toUpperCase();
  if (["PENDING", "COOLING"].includes(status)) return "cooling";
  if (["PAID", "SETTLED", "UNLOCKED"].includes(status)) return "unlocked";
  if (status === "WITHDRAWN") return "withdrawn";
  return invalid();
}

function parseBinary(value: unknown, mode: ApiResponseEnvironment): CanonicalBinaryState {
  const source = record(value);
  const sourceEnvironment = typeof source.sourceEnvironment === "string" ? source.sourceEnvironment.trim().toUpperCase() : "";
  const runId = source.runId;
  const production = source.source === "server" && mode === "prod" && source.serverCanonical === true
    && sourceEnvironment === "PRODUCTION" && runId === null;
  const sandbox = source.source === "server" && mode === "dev" && source.serverCanonical === true
    && sourceEnvironment === "SANDBOX" && isCurrentCommerceSandboxRun(runId);
  if (!Array.isArray(source.recentMatches)
      || typeof source.spilloverEnabled !== "boolean"
      || typeof source.paused !== "boolean"
      || typeof source.blockedReason !== "string"
      || (!production && !sandbox)) return invalid();
  const settlePeriod = text(source.settlePeriod) as CanonicalBinarySettlePeriod;
  const residualPolicy = text(source.residualPolicy) as CanonicalBinaryResidualPolicy;
  if (!["daily", "weekly", "monthly"].includes(settlePeriod)
      || !["monthlyClear", "perPairClear", "carryForward"].includes(residualPolicy)) return invalid();
  const trackA = number(source.trackA);
  const trackB = number(source.trackB);
  const matchRate = number(source.matchRate, 0.0000001, 1);
  const threshold = number(source.threshold, 0.0000001);
  const dailyCap = number(source.dailyCap, 0.0000001);
  const periodCap = number(source.periodCap, dailyCap);
  const estimatedAmountUsdt = number(source.estimatedAmountUsdt, 0, periodCap);
  const recentMatches = source.recentMatches.map((raw): CanonicalBinaryMatch => {
    const row = record(raw);
    const createdAt = timestamp(row.createdAt);
    const unlockAt = timestamp(row.unlockAt);
    if (unlockAt < createdAt) return invalid();
    return {
      id: id(row.id),
      amountUsdt: number(row.amountUsdt, 0.0000001),
      status: binaryStatus(row.status),
      createdAt,
      unlockAt,
    };
  });
  return {
    source: text(source.source),
    serverCanonical: true,
    sourceEnvironment: sourceEnvironment as CommissionSourceEnvironment,
    runId: sandbox ? runId as string : null,
    asOfDate: isoDate(source.asOfDate),
    trackA,
    trackB,
    trackAMembers: integer(source.trackAMembers),
    trackBMembers: integer(source.trackBMembers),
    autoPlacedMembers: integer(source.autoPlacedMembers),
    matchRate,
    threshold,
    dailyCap,
    periodCap,
    estimatedAmountUsdt,
    settlePeriod,
    residualPolicy,
    spilloverEnabled: source.spilloverEnabled,
    gvReset: text(source.gvReset),
    paused: source.paused,
    blockedReason: source.blockedReason.trim(),
    recentMatches,
  };
}

export function createCommissionConfigApi(client: ApiClient, mode: ApiResponseEnvironment = "prod"): CommissionConfigApi {
  return {
    async rates() {
      return parse(await client.request<unknown>({
        method: "GET",
        path: "/api/config/commission/rates",
        authenticated: false,
      }));
    },
    async binary() {
      return parseBinary(await client.request<unknown>({
        method: "GET",
        path: "/api/team/binary",
      }), mode);
    },
  };
}
