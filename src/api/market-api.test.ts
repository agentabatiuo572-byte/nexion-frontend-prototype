import { describe, expect, it, vi } from "vitest";
import { createMarketApi } from "./market-api";

const productionNex = {
  asset: "NEX",
  currency: "USDT",
  currentPrice: 0.125,
  costBasis: 0.085,
  sparkline: [0.11, 0.12, 0.13, 0.12, 0.14, 0.13, 0.125],
  history: [],
  historyMaxDays: 365,
  serverCanonical: true,
  source: "G3 weekly_curve + nx_price_index sampled history",
  sourceEnvironment: "PRODUCTION",
  runId: "",
};

describe("market API provenance", () => {
  it("accepts the production NEX projection only on the production rail", async () => {
    const request = vi.fn().mockResolvedValue(productionNex);
    await expect(createMarketApi({ request } as never, "prod").fetch()).resolves.toMatchObject({
      currentPrice: 0.125,
      sourceEnvironment: "PRODUCTION",
    });
  });

  it("development accepts the same canonical G3 projection", async () => {
    const request = vi.fn().mockResolvedValue(productionNex);
    await expect(createMarketApi({ request } as never, "dev").fetch()).resolves.toMatchObject({
      currentPrice: 0.125, sourceEnvironment: "PRODUCTION", runId: "",
    });
  });

  it("prefers the explicit server epoch for sampled market history", async () => {
    const payload = {
      ...productionNex,
      history: [{ price: 0.125, sampledAt: "2026-08-31 20:00:00", sampledAtEpochMs: 1788177600000 }],
    };
    const snapshot = await createMarketApi({ request: vi.fn().mockResolvedValue(payload) } as never, "prod").fetch();

    expect(snapshot.history[0]).toMatchObject({ sampledAtEpochMs: 1788177600000 });
  });

  it("development rejects the removed run-scoped sandbox NEX projection", async () => {
    const current = { ...productionNex, source: "mock", sourceEnvironment: "SANDBOX", runId: "market-sandbox-run-20260819" };
    const stale = { ...current, runId: "market-sandbox-run-20260818" };
    const request = vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(stale);
    const api = createMarketApi({ request } as never, "dev");
    await expect(api.fetch()).rejects.toMatchObject({ message: "NEX_MARKET_RESPONSE_INVALID" });
    await expect(api.fetch()).rejects.toMatchObject({ message: "NEX_MARKET_RESPONSE_INVALID" });
  });

  it("does not let a public market read establish the commerce run", async () => {
    const nex = { ...productionNex, source: "mock", sourceEnvironment: "SANDBOX", runId: "market-sandbox-run-20260819" };
    const api = createMarketApi({ request: vi.fn().mockResolvedValue(nex) } as never, "dev");

    await expect(api.fetch()).rejects.toMatchObject({ message: "NEX_MARKET_RESPONSE_INVALID" });
  });
});
