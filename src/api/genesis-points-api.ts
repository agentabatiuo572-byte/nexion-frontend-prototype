import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { matchesRuntimeProvenance } from "./runtime-provenance";

export interface GenesisPointsRow { rank: number; handle: string; points: number; holdings: number }
export interface GenesisPointsProjection {
  source: "nx_genesis_holding";
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
  pointsPerHolding: number;
  leaderboard: GenesisPointsRow[];
  currentUser: { rank: number | null; points: number; holdings: number };
  generatedAt: string;
}

function invalid(): never { throw new ApiError({ kind: "protocol", message: "GENESIS_POINTS_RESPONSE_INVALID" }); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function text(value: unknown, allowEmpty = false): string { if (typeof value !== "string" || (!allowEmpty && !value.trim())) return invalid(); return value.trim(); }
function integer(value: unknown, min = 0): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) return invalid(); return value; }
function row(value: unknown): GenesisPointsRow {
  const source = record(value);
  const rank = integer(source.rank, 1); const points = integer(source.points); const holdings = integer(source.holdings); const handle = text(source.handle);
  return { rank, handle, points, holdings };
}
function parse(value: unknown, mode: ApiEnvironment): GenesisPointsProjection {
  const source = record(value);
  if (!matchesRuntimeProvenance(source, mode, "nx_genesis_holding")
      || !Array.isArray(source.leaderboard) || integer(source.pointsPerHolding, 1) <= 0) return invalid();
  const current = record(source.currentUser);
  const currentRank = current.rank === null ? null : integer(current.rank, 1);
  const generatedAt = text(source.generatedAt);
  if (!Number.isFinite(Date.parse(generatedAt))) return invalid();
  const leaderboard = source.leaderboard.map(row);
  if (new Set(leaderboard.map(item => item.rank)).size !== leaderboard.length
      || leaderboard.some((item, index) => item.rank !== index + 1)) return invalid();
  return {
    source: "nx_genesis_holding",
    sourceEnvironment: source.sourceEnvironment,
    runId: source.runId,
    pointsPerHolding: integer(source.pointsPerHolding, 1),
    leaderboard,
    currentUser: { rank: currentRank, points: integer(current.points), holdings: integer(current.holdings) },
    generatedAt,
  };
}

export interface GenesisPointsApi { projection(): Promise<GenesisPointsProjection> }
export function createGenesisPointsApi(client: ApiClient, mode: ApiEnvironment = "prod"): GenesisPointsApi {
  return { projection: async () => parse(await client.request({ path: "/api/genesis/points" }), mode) };
}
