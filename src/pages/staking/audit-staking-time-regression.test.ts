import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import stakingPageSource from "./staking.vue?raw";
import type { ApiClient } from "@/api/api-client";
import { createExchangeApi } from "@/api/exchange-api";
import { parseServerTimestamp } from "@/api/server-time";
import { createStakingApi } from "@/api/staking-api";

const SHANGHAI_LOCAL = "2026-09-05T12:34:56";
const SHANGHAI_INSTANT = Date.parse("2026-09-05T12:34:56+08:00");
const STAKING_SOURCE = "nx_staking_product + nx_config_item + nx_emergency_control_setting";
const storeRuntime = vi.hoisted(() => ({
  remoteApiEnabled: true,
  stakingApi: {
    fetchStakingPools: vi.fn(),
    fetchStakingPositions: vi.fn(),
    openStakingPosition: vi.fn(),
    claimStakingPosition: vi.fn(),
    earlyWithdrawStakingPosition: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => storeRuntime);

const { useStaking } = await import("@/store/staking");

function client(response: unknown): ApiClient {
  return { request: vi.fn().mockResolvedValue(response) } as unknown as ApiClient;
}

function stakingSnapshot() {
  return {
    serverCanonical: true,
    source: STAKING_SOURCE,
    sourceEnvironment: "PRODUCTION",
    runId: "",
    walletBalanceUsdt: 100,
    serverTime: SHANGHAI_LOCAL,
    positionsPage: { total: 1, pageNum: 1, pageSize: 50 },
    positions: [{
      positionNo: "STK-time-regression-01",
      tierKey: "usdt30d",
      productCode: "USDT-30D",
      productName: "30 day pool",
      amountUsdt: 10,
      termDays: 30,
      apyPct: 12,
      penaltyPct: 5,
      lockedAt: SHANGHAI_LOCAL,
      unlockAt: "2026-10-05T12:34:56",
      estimatedInterestUsdt: 0.1,
      status: "ACTIVE",
    }],
  };
}

function exchangeSnapshot() {
  const caps = {
    asset: "NEX",
    currency: "USDT",
    currentPrice: 0.125,
    userDailyCapUsdt: 50,
    platformDailyCapUsdt: 20_000,
    feePct: 0,
    feeMinUsdt: 0.5,
    minUsdt: 3,
    minNex: 42,
    queueMode: "QUEUE",
    swapEnabled: true,
    serverCanonical: true,
    source: "G2/G3 server configuration",
    sourceEnvironment: "PRODUCTION",
    runId: "",
  };
  return {
    ...caps,
    caps,
    wallet: { usdtAvailable: 20, nexAvailable: 10 },
    todayUserUsedUsdt: 0,
    todayPlatformUsedUsdt: 0,
    lifetimeExchangedUsdt: 0,
    ordersPage: { total: 1, pageNum: 1, pageSize: 20 },
    orders: [{
      exchangeNo: "EX-time-regression-01",
      fromAsset: "NEX",
      toAsset: "USDT",
      fromAmount: 10,
      toAmount: 1.25,
      rate: 0.125,
      status: "COMPLETED",
      createdAt: SHANGHAI_LOCAL,
    }],
  };
}

function storeSnapshot(serverTime: number) {
  return {
    positions: [],
    positionsPage: { total: 0, pageNum: 1, pageSize: 50 },
    walletBalanceUsdt: 0,
    serverTime,
    sourceEnvironment: "PRODUCTION" as const,
    runId: "",
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  setActivePinia(createPinia());
  for (const method of Object.values(storeRuntime.stakingApi)) method.mockReset();
});

describe("staking time regression", () => {
  it("accepts complete ISO instants without shifting them and rejects malformed calendar values", () => {
    expect(parseServerTimestamp("2026-09-05T12:34:56Z")).toBe(Date.parse("2026-09-05T12:34:56Z"));
    expect(parseServerTimestamp("2026-09-05T12:34:56+05:30")).toBe(Date.parse("2026-09-05T12:34:56+05:30"));
    expect(parseServerTimestamp("2026-02-29T12:34:56")).toBeNull();
    expect(parseServerTimestamp("2026-09-05T24:00:00")).toBeNull();
    expect(parseServerTimestamp("2026-09-05")).toBeNull();
  });

  it("keeps an offset-bearing timestamp unchanged while treating a server Shanghai LocalDateTime as +08:00", async () => {
    const snapshot = stakingSnapshot();
    snapshot.serverTime = "2026-09-05T12:34:56+09:00";
    snapshot.positions[0].lockedAt = SHANGHAI_LOCAL;

    const parsed = await createStakingApi(client(snapshot)).fetchStakingPositions();

    expect(parsed).toMatchObject({
      serverTime: Date.parse(snapshot.serverTime),
      positions: [{ startTs: SHANGHAI_INSTANT }],
    });
  });

  it("projects bare Shanghai timestamps consistently for staking snapshots and exchange order history", async () => {
    const [staking, exchange] = await Promise.all([
      createStakingApi(client(stakingSnapshot())).fetchStakingPositions(),
      createExchangeApi(client(exchangeSnapshot())).fetchState(),
    ]);

    expect({
      serverTime: staking.serverTime,
      lockedAt: staking.positions[0]?.startTs,
      exchangeCreatedAt: exchange.orders[0]?.createdAt,
    }).toEqual({
      serverTime: SHANGHAI_INSTANT,
      lockedAt: SHANGHAI_INSTANT,
      exchangeCreatedAt: SHANGHAI_INSTANT,
    });
  });

  it("advances the page clock while real-mode polling is active, so duration-dependent position UI cannot freeze between snapshots", () => {
    const realModeTimer = stakingPageSource.match(/if\s*\(\s*!staking\.isMockMode\s*\)\s*\{([\s\S]*?)\n\s*return;/)?.[1];

    expect(realModeTimer).toBeDefined();
    expect(realModeTimer).toMatch(/setInterval\s*\(/);
    expect(realModeTimer).toMatch(/nowTs\.value\s*=/);
  });

  it("clears a prior account's server clock before the next account snapshot arrives", async () => {
    storeRuntime.stakingApi.fetchStakingPools.mockResolvedValueOnce([]);
    storeRuntime.stakingApi.fetchStakingPositions.mockResolvedValueOnce(storeSnapshot(1));
    const store = useStaking();

    store.bindAccount("account-a");
    await flush();
    expect(store.currentTime()).toBeLessThan(1_000_000);

    let resolvePools!: (value: unknown[]) => void;
    let resolveSnapshot!: (value: ReturnType<typeof storeSnapshot>) => void;
    storeRuntime.stakingApi.fetchStakingPools.mockReturnValueOnce(new Promise((resolve) => { resolvePools = resolve; }));
    storeRuntime.stakingApi.fetchStakingPositions.mockReturnValueOnce(new Promise((resolve) => { resolveSnapshot = resolve; }));
    store.bindAccount("account-b");

    expect(store.currentTime()).toBeGreaterThan(1_000_000);
    resolvePools([]);
    resolveSnapshot(storeSnapshot(2));
    await flush();
  });

  /**
   * zentao #228:安全设置页把「当前设备登录时间」直接喂给 `Date.parse`,而后端字段是
   * Java `LocalDateTime` 序列化出的**无时区**串、按业务时区 Asia/Shanghai 写入。
   * 本机在 +09:00 时 `Date.parse` 会把它当成东京本地时间 —— 刚注册账号的当前设备
   * 于是显示「59 分钟前」,差的正是那 1 小时。安全页必须与提现/兑换等面一样走
   * `parseServerTimestamp`。
   */
  it("reads a freshly issued session timestamp as just now rather than an hour ago", () => {
    // 后端此刻会写下的值:上海墙钟、无时区后缀。
    const shanghaiWallClockNow = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 19);

    // 正确路径:默认 +08:00 → 差值≈0 → 页面显示「刚刚」。
    expect(Date.now() - (parseServerTimestamp(shanghaiWallClockNow) as number)).toBeLessThan(5 * 60 * 1000);
    // 旧写法:当成本机时区 → 差值≈1 小时 → 页面显示「59 分钟前」。
    expect(Date.now() - Date.parse(shanghaiWallClockNow)).toBeGreaterThan(55 * 60 * 1000);
  });

  it("routes the security page's session timestamps through the business-zone parser", async () => {
    const securitySource = (await import("../../pages/me/security.vue?raw")).default as string;
    expect(securitySource).toContain("parseServerTimestamp(item.lastActiveAt)");
    // 直接 Date.parse 服务端时间戳就是本单的成因,不允许回来。
    expect(securitySource).not.toContain("lastActiveMs: Date.parse(");
  });
});
