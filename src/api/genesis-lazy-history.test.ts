import { describe, expect, it, vi } from "vitest";
import { createGenesisApi } from "./genesis-api";

const authority = { serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" };
describe("bounded Genesis history reads", () => {
  it("returns the first public transaction page instead of following its cursor", async () => {
    const state = { ...authority, halted: false, revision: "test", source: "server",
      series: { seriesCode: "main", name: "Genesis", totalSupply: 1000, soldSupply: 1,
        remainingSupply: 999, priceUsdt: 9999, royaltyPct: 2.5, dailyEmissionRatePct: 0 },
      sale: { serverCanonical: true, available: true, eligibilityEnabled: true, maxPerUser: 5,
        minAccountAgeDays: 0, presaleEnabled: false, showCountdown: false, unitPriceUsdt: 9999, open: true },
      market: { enabled: true }, emission: { open: false }, listings: [], transactions: [],
      tiers: [{ id: "one", from: 0, to: 1000, priceUSDT: 9999 }], tiersVersion: 1,
      marketOpenState: "open", marketOpenStateVersion: 1, showcaseEnabled: true,
      closedNoticeKey: "default", catalogAvailable: true, tradeAvailable: true, tradeBlockedReason: "NONE",
      marketStats: { floorUsdt: null, volume24hUsdt: 12345, owners: 1, floorDeltaPct: null, lastSaleUsdt: null } };
    const request = vi.fn(async ({ path }: { path: string }) => path === "/api/genesis/state" ? state
      : { ...authority, items: [], nextCursor: path.includes("transactions") ? "999999" : null });
    const result = await createGenesisApi({ request } as never).state();
    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenCalledWith({ method: "GET", authenticated: false, path: "/api/genesis/state?history=listings" });
    expect(request).toHaveBeenCalledWith({ method: "GET", authenticated: false, path: "/api/genesis/state?history=transactions" });
    expect(result.transactionsNextCursor).toBe("999999");
    expect(result.marketStats.volume24hUsdt).toBe(12345);
  });

  it("loads only the requested personal page with authentication", async () => {
    const request = vi.fn().mockResolvedValue({ ...authority, items: [], nextCursor: "123" });
    const api = createGenesisApi({ request } as never);
    expect((await api.orderPage("999")).nextCursor).toBe("123");
    expect((await api.emissionPage("456")).nextCursor).toBe("123");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith({ method: "GET", authenticated: true, path: "/api/genesis/account?history=orders&cursor=999" });
    expect(request).toHaveBeenCalledWith({ method: "GET", authenticated: true, path: "/api/genesis/account?history=emissions&cursor=456" });
  });
});
