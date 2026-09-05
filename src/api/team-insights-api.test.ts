import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createTeamInsightsApi } from "./team-insights-api";

describe("team unilevel API", () => {
  it("accepts server-owned cycle, source, layer and currency split", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", period: "week",
      events: [{ id: "CM-21", source: "network", sourceUserName: "Bob", cycle: "2026-W33",
        layer: 1, orderId: "ORD-1", orderAmountUSD: 99, amountUSDT: 9.9, amountNEX: 50,
        currency: "USDT", status: "cooling", ts: 1755043200000, unlockAt: 1757635200000 }],
      split: { direct: { amountUSDT: 9.9, amountNEX: 50, count: 1 },
        extended: { amountUSDT: 0, amountNEX: 0, count: 0 } },
      generatedAt: "2026-08-13T00:00:00Z",
    });
    const api = createTeamInsightsApi({ request } as unknown as ApiClient);
    await expect(api.unilevel("week")).resolves.toMatchObject({
      period: "week", events: [{ cycle: "2026-W33", layer: 1 }], split: { direct: { count: 1 } },
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/app/team/insights/unilevel?period=week" });
  });

  it("rejects unilevel events that expose source user ids", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", period: "week",
      events: [{ id: "CM-21", source: "network", sourceUserId: "8", sourceUserName: "Bob", cycle: "2026-W33",
        layer: 1, orderId: null, orderAmountUSD: 0, amountUSDT: 1, amountNEX: 0, currency: "USDT",
        status: "cooling", ts: 1755043200000, unlockAt: 1757635200000 }],
      split: { direct: { amountUSDT: 1, amountNEX: 0, count: 1 }, extended: { amountUSDT: 0, amountNEX: 0, count: 0 } },
      generatedAt: "2026-08-13T00:00:00Z",
    });
    const api = createTeamInsightsApi({ request } as unknown as ApiClient);
    await expect(api.unilevel("week")).rejects.toMatchObject({ message: "TEAM_INSIGHTS_RESPONSE_INVALID" });
  });
});
