import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { matchesRuntimeProvenance } from "./runtime-provenance";

export interface NetworkRankSnapshot {
  source: "SIMULATED_DEVICE_DISTRIBUTION";
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
  serverCanonical: true;
  currentRank: number | null;
  state: "ranked" | "unranked" | "disabled" | "unavailable";
  population: number | null;
  deviceTops: number | null;
  modelVersion: number;
  generatedAt: string;
}
function invalid(): never { throw new ApiError({ kind: "protocol", message: "NETWORK_RANK_RESPONSE_INVALID" }); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function nullableInteger(value: unknown, min = 0): number | null {
  if (value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min ? value : invalid();
}
function parse(value: unknown, mode: ApiEnvironment): NetworkRankSnapshot {
  const source = record(value);
  const currentRank = nullableInteger(source.currentRank, 1);
  const population = nullableInteger(source.population);
  const modelVersion = nullableInteger(source.modelVersion);
  const deviceTops = source.deviceTops;
  if (source.serverCanonical !== true || !matchesRuntimeProvenance(source, mode, "SIMULATED_DEVICE_DISTRIBUTION")
      || !["ranked", "unranked", "disabled", "unavailable"].includes(String(source.state))
      || modelVersion === null
      || (deviceTops !== null && (typeof deviceTops !== "number" || !Number.isFinite(deviceTops) || deviceTops < 0))
      || (source.state === "ranked" && (currentRank === null || population === null || currentRank > population || deviceTops === null || deviceTops <= 0))
      || (source.state !== "ranked" && currentRank !== null)
      || typeof source.generatedAt !== "string" || !Number.isFinite(Date.parse(source.generatedAt))) return invalid();
  return { source: "SIMULATED_DEVICE_DISTRIBUTION", sourceEnvironment: source.sourceEnvironment, runId: source.runId,
    serverCanonical: true, currentRank, population, deviceTops: deviceTops as number | null,
    modelVersion, state: source.state as NetworkRankSnapshot["state"], generatedAt: source.generatedAt };
}
export interface NetworkRankApi { snapshot(): Promise<NetworkRankSnapshot> }
export function createNetworkRankApi(client: ApiClient, mode: ApiEnvironment = "prod"): NetworkRankApi {
  return { snapshot: async () => parse(await client.request({ path: "/api/app/network/device-rank" }), mode) };
}
