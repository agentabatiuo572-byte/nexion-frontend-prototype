import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface NetworkRankSnapshot {
  source: "nx_user_device";
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  currentRank: number | null;
  rankChange24h: number | null;
  snapshotAvailable: boolean;
  generatedAt: string;
}
function invalid(): never { throw new ApiError({ kind: "protocol", message: "NETWORK_RANK_RESPONSE_INVALID" }); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function nullableInteger(value: unknown, min = 0): number | null {
  if (value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min ? value : invalid();
}
function parse(value: unknown): NetworkRankSnapshot {
  const source = record(value);
  const currentRank = nullableInteger(source.currentRank, 1);
  const delta = nullableInteger(source.rankChange24h);
  if (source.source !== "nx_user_device" || (source.sourceEnvironment !== "PRODUCTION" && source.sourceEnvironment !== "SANDBOX")
      || typeof source.snapshotAvailable !== "boolean"
      || (source.snapshotAvailable && delta === null)
      || (!source.snapshotAvailable && delta !== null)
      || typeof source.generatedAt !== "string" || !Number.isFinite(Date.parse(source.generatedAt))) return invalid();
  return { source: "nx_user_device", sourceEnvironment: source.sourceEnvironment, currentRank, rankChange24h: delta,
    snapshotAvailable: source.snapshotAvailable, generatedAt: source.generatedAt };
}
export interface NetworkRankApi { snapshot(): Promise<NetworkRankSnapshot> }
export function createNetworkRankApi(client: ApiClient): NetworkRankApi {
  return { snapshot: async () => parse(await client.request({ path: "/api/app/network/rank" })) };
}
