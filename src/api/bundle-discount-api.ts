import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface BundleDiscountTier {
  minItems: 2 | 3 | 4;
  pct: number;
}

export interface BundleDiscountSnapshot {
  source: "server";
  serverCanonical: true;
  policyVersion: number;
  tiers: readonly BundleDiscountTier[];
}

export interface BundleDiscountApi {
  current(): Promise<BundleDiscountSnapshot>;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "BUNDLE_DISCOUNT_RESPONSE_INVALID" });
}

export function parseBundleDiscountSnapshot(value: unknown): BundleDiscountSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (row.source !== "server" || row.serverCanonical !== true
      || !Number.isSafeInteger(row.policyVersion) || (row.policyVersion as number) < 1
      || !Array.isArray(row.tiers)
      || row.tiers.length !== 3) return invalid();
  const expected = [2, 3, 4] as const;
  const tiers = row.tiers.map((item, index): BundleDiscountTier => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return invalid();
    const tier = item as Record<string, unknown>;
    if (tier.minItems !== expected[index] || typeof tier.rate !== "number"
        || !Number.isFinite(tier.rate) || tier.rate <= 0 || tier.rate > 0.5) return invalid();
    return { minItems: expected[index], pct: tier.rate };
  });
  if (tiers[1].pct < tiers[0].pct || tiers[2].pct < tiers[1].pct) return invalid();
  return { source: "server", serverCanonical: true, policyVersion: row.policyVersion as number, tiers };
}

export function createBundleDiscountApi(client: ApiClient): BundleDiscountApi {
  return {
    async current() {
      return parseBundleDiscountSnapshot(await client.request<unknown>({
        path: "/api/store/bundle-discount",
      }));
    },
  };
}
