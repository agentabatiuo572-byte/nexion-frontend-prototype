import { describe, expect, it, vi } from "vitest";
import { createStakingApi } from "./staking-api";
import type { ApiRequest } from "./api-client";
// @ts-expect-error The standalone demo is intentionally outside the App TS source tree.
import { stakingDemo } from "../../scripts/lib/prototype-demo-staking.mjs";
// @ts-expect-error The standalone demo is intentionally outside the App TS source tree.
import { demoFixture, demoDefaults } from "../../scripts/lib/prototype-demo-data.mjs";

describe("standalone staking demo through production parsers", () => {
  it("isolates a staking read failure from platform access and recovers without replacing the state", () => {
    const state = { ...demoDefaults, stakingState: "error" };
    const get = (path: string) => demoFixture(new URL(path, 'http://127.0.0.1'), 'zh', state, { method: () => 'GET' });
    expect(get('/api/config/platform').featureFlags.stakingVisible).toBe(true);
    for (const path of ['/api/config/staking/pools', '/api/stakes']) {
      expect(() => get(path)).toThrow('DEMO_STAKING_READ_UNAVAILABLE');
    }
    state.stakingState = "enabled";
    expect(get('/api/config/staking/pools')).toBeTruthy();
    expect(get('/api/stakes')).toBeTruthy();
  });
  it("exposes a real disabled flag while preserving unrelated platform and share state", () => {
    const state = { ...demoDefaults }, read = () => demoFixture(new URL('/api/config/platform', 'http://127.0.0.1'), 'zh', state, { method: () => 'GET' });
    expect(read().featureFlags.stakingVisible).toBe(true);
    state.stakingState = 'delisted';
    expect(read().featureFlags.stakingVisible).toBe(false);
    expect(read().publicStats.registeredUsersBase).toBe(12480);
    expect(read().share.channels.map((channel: { key: string }) => channel.key)).toContain('poster');
  });
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
