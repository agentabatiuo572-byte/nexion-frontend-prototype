import { describe, expect, it } from "vitest";
import type { EarnPhoneTier } from "@/api/earn-config-api";
import type { Product } from "@/mock/products";
import {
  buildStoreYieldAuthority,
  storefrontNex,
  storefrontNexFull,
} from "./store-yield-authority";

const proof = { source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true };

const product = (id: string, tier: Product["tier"], dailyEarn: number, dailyEarnNEX: number): Product => ({
  id, name: id, tier, tagline: "", dailyEarn, dailyEarnNEX, price: 1, sold: 0, features: [], available: true,
});

const phoneTiers: EarnPhoneTier[] = [1, 2, 3, 4, 5].map((tier) => ({
  tier,
  name: `T${tier}`,
  baseRateUsdt: tier === 3 ? 0.06 : tier / 100,
  baseRateNex: tier === 3 ? 10 : tier,
  effectiveAt: "2026-08-22T00:00:00",
}));

describe("store yield authority", () => {
  it("keeps Cloud Share out of a daily USD ladder", () => {
    const result = buildStoreYieldAuthority([
      product("cloud-share", "Share", 0.19, 3),
      product("stellarbox-s1", "Entry", 7, 40),
      product("stellarbox-pro-v2", "Pro", 14, 90),
      product("stellarbox-pro", "Pro", 13, 80),
      product("rack-p2", "Flagship", 75, 500),
      product("stellarrack-p1", "Flagship", 45, 300),
    ], phoneTiers, proof);

    expect(result.complete).toBe(true);
    expect(result.multiplier).toBe(117);
    expect(result.phone).toEqual({ usd: 0.06, nex: 10 });
    expect(result.entry).toEqual({ usd: 7, nex: 40 });
    expect(result.pro).toEqual({ usd: 13, nex: 80 });
    expect(result.rack).toEqual({ usd: 45, nex: 300 });
    expect(result.ladder.map((row) => row.id)).toEqual(["phone", "entry", "pro", "rack"]);
    expect(result.ladder.at(-1)?.widthPct).toBe(100);
  });

  it("keeps the UI shape but leaves missing PC authority visibly empty", () => {
    const result = buildStoreYieldAuthority([product("stellarbox-pro", "Pro", 13, 80)], phoneTiers, proof);

    expect(result.complete).toBe(false);
    expect(result.multiplier).toBeNull();
    expect(result.ladder).toHaveLength(4);
    expect(result.entry).toBeNull();
  });

  it("matches the four named comparison SKUs exactly instead of guessing by tier", () => {
    const result = buildStoreYieldAuthority([
      product("cloud-share", "Share", 0.19, 3),
      product("cheaper-entry", "Entry", 1, 10),
      product("stellarbox-s1", "Entry", 7, 40),
      product("stellarbox-pro", "Pro", 13, 80),
      product("stellarrack-p1", "Flagship", 45, 300),
    ], phoneTiers, proof);

    expect(result.entry).toEqual({ usd: 7, nex: 40 });
  });

  it("fails the catalog-derived values closed without Java production provenance", () => {
    const result = buildStoreYieldAuthority([
      product("cloud-share", "Share", 0.19, 3),
      product("stellarbox-s1", "Entry", 7, 40),
    ], phoneTiers, { source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run", serverCanonical: true });

    expect(result.entry).toBeNull();
  });

  it("keeps extreme NEX yields compact while preserving the full accessible value", () => {
    const amount = { usd: 1, nex: 1_520_000 };

    expect(storefrontNex(amount)).toBe("1.5M");
    expect(storefrontNexFull(amount)).toBe("1,520,000 NEX");
  });
});
