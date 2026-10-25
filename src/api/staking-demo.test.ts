import { describe, expect, it, vi } from "vitest";
import { createStakingApi } from "./staking-api";
import type { ApiRequest } from "./api-client";
// @ts-expect-error The standalone demo is intentionally outside the App TS source tree.
import { stakingDemo } from "../../scripts/lib/prototype-demo-staking.mjs";

describe("standalone staking demo through production parsers", () => {
  it.each(["normal", "empty"])("parses %s pools and complete paginated positions", async (dataState) => {
    const request = vi.fn(async (req: ApiRequest) => stakingDemo(new URL(req.path, "http://127.0.0.1"),
      { dataState, stakingNow: Date.parse("2026-10-25T07:34:50.864Z") }, { method: () => req.method }));
    const api = createStakingApi({ request } as never);
    const pools = await api.fetchStakingPools();
    const snapshot = await api.fetchStakingPositions();
    expect(pools.map(p => p.apy)).toEqual([.12, .15, .18, .20]);
    expect(snapshot.positions).toHaveLength(dataState === "empty" ? 0 : 1);
    expect(snapshot.walletBalanceUsdt).toBe(dataState === "empty" ? 0 : 1000);
    expect(snapshot.positionsPage.snapshotId).toBe("1");
    if (dataState !== "empty") expect(snapshot.positions[0]).toMatchObject({ id: "AUDIT-READONLY-001", amountUSDT: 100, status: "active" });
    expect(request.mock.calls.every(([r]) => r.method === "GET")).toBe(true);
  });
  it("does not handle writes, recovery commands or unrelated routes", () => {
    for (const [method, path] of [["POST", "/api/stakes"], ["POST", "/api/stakes/id/claim"], ["GET", "/api/stakes/open-status"], ["GET", "/api/bank-accounts"]]) {
      expect(stakingDemo(new URL(path, "http://127.0.0.1"), {}, { method: () => method })).toBeUndefined();
    }
  });
});
