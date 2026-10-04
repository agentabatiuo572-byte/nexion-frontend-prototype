import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";

export interface VRankProvenance {
  serverCanonical: true;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

/** 服务端能力位:某类收益今天是否真的会派发。与佣金指南同源,同一份事实。 */
export interface CommissionCapabilities {
  peer: boolean;
  genesis: boolean;
}

export interface CanonicalVRankRow {
  v: number;
  title: string;
  cnTitle: string;
  selfBuyUSD?: number;
  directRefs?: number;
  teamVolumeUSD?: number;
  requiredDownlineRank?: number;
  requiredDownlineCount?: number;
  directBonus: number;
  unilevelDepth: number;
  peerBonus: number;
  leadershipVotes: number;
  cultivationBonus: number;
  rewards: CanonicalVRankReward[];
  visible: boolean;
}

export interface MonetaryVRankReward {
  type: "USDT" | "NEX";
  amount: number;
  voucherId?: string;
  skuId?: string;
  customLabel?: string;
}

export interface EntitlementVRankReward {
  type: "VOUCHER" | "SKU" | "CUSTOM";
  amount?: number;
  voucherId?: string;
  skuId?: string;
  customLabel?: string;
  displayName?: string;
}

export type CanonicalVRankReward = MonetaryVRankReward | EntitlementVRankReward;

export interface CanonicalVRankLadder {
  source: string;
  prizeName: string;
  /**
   * 服务端能力位:某类收益今天是否真的会派发。
   *
   * 🔴 等级阶梯里的 peerBonus 是「该等级配置的比例」,不是「现在会发」。没有这个
   *   能力位,App 只能把配置比例当成已生效权益展示(V3–V12 逐级「平级 5%」),
   *   与玩法说明的「未开放」自相矛盾(zentao #79)。
   */
  capabilities: CommissionCapabilities;
  serverCanonical: true;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
  ranks: CanonicalVRankRow[];
}

export interface CanonicalVRankState {
  source: string;
  serverCanonical: true;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
  rankCode: string;
  progress: {
    selfBuyUSD: number;
    directRefs: number;
    teamVolumeUSD: number;
    vDownlineCounts: Record<string, number>;
  };
}

export interface VRankApi {
  ladder(): Promise<CanonicalVRankLadder>;
  current(): Promise<CanonicalVRankState>;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "V_RANK_RESPONSE_INVALID" });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value.trim();
}

function number(value: unknown, minimum = 0): number {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < minimum) return invalid();
  return parsed;
}

function optionalNumber(value: unknown, minimum = 0): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return number(value, minimum);
}

function integer(value: unknown, minimum = 0): number {
  const parsed = number(value, minimum);
  if (!Number.isInteger(parsed)) return invalid();
  return parsed;
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return text(value);
}

function reward(value: unknown): CanonicalVRankReward {
  const source = record(value);
  const type = text(source.type).toUpperCase();
  if (type !== "USDT" && type !== "NEX" && type !== "VOUCHER" && type !== "SKU" && type !== "CUSTOM") return invalid();
  if (type === "USDT" || type === "NEX") {
    return { type, amount: number(source.amount), voucherId: optionalText(source.voucherId),
      skuId: optionalText(source.skuId), customLabel: optionalText(source.customLabel) };
  }
  const amount = optionalNumber(source.amount);
  const displayName = optionalText(source.displayName);
  return { type, ...(displayName === undefined ? {} : { displayName }), ...(amount === undefined ? {} : { amount }), voucherId: optionalText(source.voucherId),
    skuId: optionalText(source.skuId), customLabel: optionalText(source.customLabel) };
}

function rankRow(value: unknown): CanonicalVRankRow {
  const source = record(value);
  const v = integer(source.v);
  if (v > 12 || typeof source.visible !== "boolean") return invalid();
  const requiredRank = source.requiredDownlineRank == null || source.requiredDownlineRank === ""
    ? undefined
    : integer(String(source.requiredDownlineRank).replace(/^V/i, ""));
  if (!Array.isArray(source.rewards)) return invalid();
  return {
    v,
    title: text(source.title),
    cnTitle: text(source.cnTitle),
    selfBuyUSD: optionalNumber(source.selfBuyUSD),
    directRefs: optionalNumber(source.directRefs),
    teamVolumeUSD: optionalNumber(source.teamVolumeUSD),
    requiredDownlineRank: requiredRank,
    requiredDownlineCount: optionalNumber(source.requiredDownlineCount),
    directBonus: number(source.directBonus),
    unilevelDepth: integer(source.unilevelDepth),
    peerBonus: number(source.peerBonus),
    leadershipVotes: integer(source.leadershipVotes),
    cultivationBonus: number(source.cultivationBonus),
    rewards: source.rewards.map(reward),
    visible: source.visible,
  };
}

function provenance(source: Record<string, unknown>, mode: ApiEnvironment): VRankProvenance {
  const sourceEnvironment = source.sourceEnvironment;
  const runId = source.runId;
  if ((mode !== "dev" && mode !== "prod") || source.serverCanonical !== true
      || sourceEnvironment !== "PRODUCTION" || runId !== "") {
    return invalid();
  }
  return { serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" };
}

function ladder(value: unknown, mode: ApiEnvironment): CanonicalVRankLadder {
  const source = record(value);
  const proof = provenance(source, mode);
  if (!Array.isArray(source.ranks)) return invalid();
  const ranks = source.ranks.map(rankRow).sort((left, right) => left.v - right.v);
  if (ranks.length !== 13 || ranks.some((rank, index) => rank.v !== index)) return invalid();
  // 旧后端(尚未下发能力位)不能让整个阶梯判非法 —— 那会把等级页变成「数据不可用」,
  // 连配置比例都读不到。缺字段一律**失败关闭**为「不派发」:宁可少承诺,不能把配置
  // 比例写成已生效权益(#79)。字段在但类型不对属于协议违规,仍判非法。
  let capabilities: CommissionCapabilities = { peer: false, genesis: false };
  if (source.capabilities !== undefined && source.capabilities !== null) {
    const raw = record(source.capabilities);
    if (typeof raw.peer !== "boolean" || typeof raw.genesis !== "boolean") return invalid();
    capabilities = { peer: raw.peer, genesis: raw.genesis };
  }
  return {
    source: text(source.source), prizeName: text(source.prizeName),
    capabilities, ...proof, ranks,
  };
}

function current(value: unknown, mode: ApiEnvironment): CanonicalVRankState {
  const source = record(value);
  const proof = provenance(source, mode);
  const progress = record(source.progress);
  const rawCounts = record(progress.vDownlineCounts);
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(rawCounts)) {
    if (!/^(?:[0-9]|1[0-2])$/.test(key)) return invalid();
    counts[key] = integer(count);
  }
  const rankCode = text(source.rankCode).toUpperCase();
  if (!/^V(?:[0-9]|1[0-2])$/.test(rankCode)) return invalid();
  return {
    source: text(source.source),
    ...proof,
    rankCode,
    progress: {
      selfBuyUSD: number(progress.selfBuyUSD),
      directRefs: integer(progress.directRefs),
      teamVolumeUSD: number(progress.teamVolumeUSD),
      vDownlineCounts: counts,
    },
  };
}

export function createVRankApi(client: ApiClient, mode: ApiEnvironment = "prod"): VRankApi {
  return {
    async ladder() {
      return ladder(await client.request<unknown>({
        method: "GET",
        path: "/api/config/v-ranks",
        authenticated: false,
      }), mode);
    },
    async current() {
      return current(await client.request<unknown>({
        method: "GET",
        path: "/api/team/rank",
      }), mode);
    },
  };
}
