import type { ApiClient } from "./api-client";
import type { ApiEnvironment } from "./runtime-config";
import { ApiError } from "./errors";

export interface CommissionGuideRates { unilevelUsdt: Record<number, number>; unilevelNex: Record<number, number> }

export interface CommissionGuideRules {
  source: "server";
  serverCanonical: true;
  sourceEnvironment: "PRODUCTION";
  runId: null;
  coolingDays: number | null;
  network: { depthGateLayer: number | null; depthGateRank: number | null; exitCapRate: number | null };
  binary: null | { threshold: number; matchRate: number; dailyCap: number; settlePeriod: "daily" | "weekly" | "monthly"; residualPolicy: "monthlyClear" | "perPairClear" | "carryForward"; paused: boolean };
  leadership: null | { rate: number; minRank: number; monthlyCap: number };
  capabilities: { peer: boolean; genesis: boolean };
}

function invalid(): never { throw new ApiError({ kind: "protocol", message: "COMMISSION_GUIDE_RESPONSE_INVALID" }); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return invalid();
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  const n = number(value, min, max);
  if (!Number.isSafeInteger(n)) return invalid();
  return n;
}
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  return allowed.includes(value as T) ? value as T : invalid();
}
function parse(value: unknown, mode: ApiEnvironment): CommissionGuideRules {
  const row = record(value), network = record(row.network), capabilities = record(row.capabilities);
  if (!["dev", "prod"].includes(mode) || row.source !== "server" || row.serverCanonical !== true || row.sourceEnvironment !== "PRODUCTION" || row.runId !== null) return invalid();
  const b = row.binary === null ? null : record(row.binary);
  const l = row.leadership === null ? null : record(row.leadership);
  return {
    source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: null,
    coolingDays: row.coolingDays === null ? null : integer(row.coolingDays, 0, Number.MAX_SAFE_INTEGER),
    network: {
      depthGateLayer: network.depthGateLayer === null ? null : integer(network.depthGateLayer, 1, 7),
      depthGateRank: network.depthGateRank === null ? null : integer(network.depthGateRank, 0, 12),
      exitCapRate: network.exitCapRate === null ? null : number(network.exitCapRate, 0, 1),
    },
    binary: b === null ? null : {
      threshold: number(b.threshold, Number.MIN_VALUE), matchRate: number(b.matchRate, Number.MIN_VALUE, 1), dailyCap: number(b.dailyCap, Number.MIN_VALUE),
      settlePeriod: choice(b.settlePeriod, ["daily", "weekly", "monthly"]),
      residualPolicy: choice(b.residualPolicy, ["monthlyClear", "perPairClear", "carryForward"]), paused: bool(b.paused),
    },
    leadership: l === null ? null : { rate: number(l.rate, 0, .3), minRank: integer(l.minRank, 1, 12), monthlyCap: number(l.monthlyCap) },
    capabilities: { peer: bool(capabilities.peer), genesis: bool(capabilities.genesis) },
  };
}
export function createCommissionGuideApi(client: ApiClient, mode: ApiEnvironment = "prod") {
  return {
    read: async () => parse(await client.request<unknown>({ method: "GET", path: "/api/config/commission/guide", authenticated: false }), mode),
    async rates(): Promise<CommissionGuideRates> {
      const row = record(await client.request<unknown>({ method: "GET", path: "/api/config/commission/rates", authenticated: false }));
      if (!["dev", "prod"].includes(mode) || !["server", "nx_commission_rule + nx_config_item"].includes(row.source as string)
        || row.serverCanonical !== true || row.sourceEnvironment !== "PRODUCTION" || row.runId !== null
        || !Array.isArray(row.unilevel)) return invalid();
      const unilevelUsdt: Record<number, number> = {}, unilevelNex: Record<number, number> = {};
      for (const raw of row.unilevel) {
        const item = record(raw), match = typeof item.level === "string" ? /^L([1-7])$/.exec(item.level) : null;
        if (!match || unilevelUsdt[Number(match[1])] !== undefined) return invalid();
        const level = Number(match[1]);
        unilevelUsdt[level] = rateNumber(item.usdtPct, 100) / 100;
        unilevelNex[level] = rateNumber(item.nexReward, Number.MAX_SAFE_INTEGER);
      }
      if (Object.keys(unilevelUsdt).length !== 7) return invalid();
      // No L1=10%, total=25%, cooldown, promo, influence or partner-tier assumptions here.
      return { unilevelUsdt, unilevelNex };
    },
  };
}

function rateNumber(raw: unknown, max: number): number {
  const value = typeof raw === "string" && /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  return number(value, 0, max);
}
