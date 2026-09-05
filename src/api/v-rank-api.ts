import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

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
  visible: boolean;
}

export interface CanonicalVRankLadder {
  source: string;
  ranks: CanonicalVRankRow[];
}

export interface CanonicalVRankState {
  source: string;
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

function rankRow(value: unknown): CanonicalVRankRow {
  const source = record(value);
  const v = integer(source.v);
  if (v > 12 || typeof source.visible !== "boolean") return invalid();
  const requiredRank = source.requiredDownlineRank == null || source.requiredDownlineRank === ""
    ? undefined
    : integer(String(source.requiredDownlineRank).replace(/^V/i, ""));
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
    visible: source.visible,
  };
}

function ladder(value: unknown): CanonicalVRankLadder {
  const source = record(value);
  if (!Array.isArray(source.ranks)) return invalid();
  const ranks = source.ranks.map(rankRow).sort((left, right) => left.v - right.v);
  if (ranks.length !== 13 || ranks.some((rank, index) => rank.v !== index)) return invalid();
  return { source: text(source.source), ranks };
}

function current(value: unknown): CanonicalVRankState {
  const source = record(value);
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
    rankCode,
    progress: {
      selfBuyUSD: number(progress.selfBuyUSD),
      directRefs: integer(progress.directRefs),
      teamVolumeUSD: number(progress.teamVolumeUSD),
      vDownlineCounts: counts,
    },
  };
}

export function createVRankApi(client: ApiClient): VRankApi {
  return {
    async ladder() {
      return ladder(await client.request<unknown>({
        method: "GET",
        path: "/api/config/v-ranks",
        authenticated: false,
      }));
    },
    async current() {
      return current(await client.request<unknown>({
        method: "GET",
        path: "/api/team/rank",
      }));
    },
  };
}
