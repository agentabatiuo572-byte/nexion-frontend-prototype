import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface EarningsReleaseStatus {
  buckets: { withdrawable: number; pending_review: number; bonus_locked: number };
  assets: Record<string, Record<string, number>>;
  releaseMode: "attest_or_manual" | "manual_only";
  attestedOnlineSeconds: number;
  requiredAttestationSeconds: number;
  clusterRestricted: boolean;
  serverCanonical: true;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parse(value: unknown): EarningsReleaseStatus {
  const row = record(value);
  const buckets = record(row?.buckets);
  const assets = record(row?.assets);
  const withdrawable = number(buckets?.withdrawable);
  const pending_review = number(buckets?.pending_review);
  const bonus_locked = number(buckets?.bonus_locked);
  const attestedOnlineSeconds = number(row?.attestedOnlineSeconds);
  const requiredAttestationSeconds = number(row?.requiredAttestationSeconds);
  if (!row || row.serverCanonical !== true || !assets
      || (row.releaseMode !== "attest_or_manual" && row.releaseMode !== "manual_only")
      || typeof row.clusterRestricted !== "boolean"
      || withdrawable === null || pending_review === null || bonus_locked === null
      || attestedOnlineSeconds === null || requiredAttestationSeconds === null) {
    throw new ApiError({ kind: "protocol", message: "EARNINGS_RELEASE_STATUS_INVALID" });
  }
  const parsedAssets: Record<string, Record<string, number>> = {};
  for (const [asset, raw] of Object.entries(assets)) {
    const values = record(raw);
    if (!values) throw new ApiError({ kind: "protocol", message: "EARNINGS_RELEASE_STATUS_INVALID" });
    parsedAssets[asset] = Object.fromEntries(Object.entries(values).map(([key, amount]) => {
      const parsed = number(amount);
      if (parsed === null) throw new ApiError({ kind: "protocol", message: "EARNINGS_RELEASE_STATUS_INVALID" });
      return [key, parsed];
    }));
  }
  return {
    buckets: { withdrawable, pending_review, bonus_locked },
    assets: parsedAssets,
    releaseMode: row.releaseMode,
    attestedOnlineSeconds,
    requiredAttestationSeconds,
    clusterRestricted: row.clusterRestricted,
    serverCanonical: true,
  };
}

export function createEarningsReleaseApi(client: ApiClient) {
  return { status: async () => parse(await client.request({ method: "GET", path: "/api/earnings/release-status" })) };
}
