// Synthetic, loopback-only read model based on remainder/staking-fixture.json.
// Mount stakingDemo(url, state, request) before generic demo routes. Wrap its
// non-undefined result in the demo's usual API success envelope. GET only;
// writes and open-status are deliberately unsupported. Never forward them.
// state.dataState === "empty" gives a canonical empty account. Optional
// state.stakingNow fixes the clock for repeatable review. Inject 503 at the
// host route for error/retry checks; errors must not return an empty snapshot.
const DAY = 86_400_000;
const proof = {
  source: "nx_staking_product + nx_config_item + nx_emergency_control_setting",
  sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
};

export function createStakingDemoFixture({ empty = false, now = Date.now() } = {}) {
  return {
    pools: {
      ...proof,
      pools: [30, 90, 180, 365].map((termDays, index) => ({
        poolId: index + 1, tierKey: `usdt${termDays}d`, currency: "USDT", termDays,
        apyPct: [12, 15, 18, 20][index], penaltyPct: 5, minAmountUsdt: 20,
        enabled: true, killed: false, status: "ACTIVE",
      })),
    },
    snapshot: {
      ...proof, walletBalanceUsdt: empty ? 0 : 1000,
      serverTime: new Date(now).toISOString(),
      positions: empty ? [] : [{
        positionNo: "AUDIT-READONLY-001", tierKey: "usdt30d",
        productCode: "AUDIT30", productName: "Audit 30 day",
        amountUsdt: 100, termDays: 30, apyPct: 12, penaltyPct: 5,
        lockedAt: new Date(now - DAY).toISOString(),
        unlockAt: new Date(now + 29 * DAY).toISOString(),
        estimatedInterestUsdt: .99, status: "ACTIVE",
      }],
      positionsPage: { total: empty ? 0 : 1, pageNum: 1, pageSize: 50, snapshotId: "1" },
    },
  };
}

export function stakingDemo(url, state, request) {
  if (request.method() !== "GET") return undefined;
  if (url.pathname !== "/api/config/staking/pools" && url.pathname !== "/api/stakes") return undefined;
  if (state.stakingState === "error") throw Object.assign(new Error("DEMO_STAKING_READ_UNAVAILABLE"), { status: 503 });
  const fixture = createStakingDemoFixture({ empty: state.dataState === "empty", now: state.stakingNow });
  if (url.pathname === "/api/config/staking/pools") return fixture.pools;
  const pageNum = Math.max(1, Number(url.searchParams.get("pageNum") || 1));
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") || 50));
  return { ...fixture.snapshot,
    positions: fixture.snapshot.positions.slice((pageNum - 1) * pageSize, pageNum * pageSize),
    positionsPage: { ...fixture.snapshot.positionsPage, pageNum, pageSize },
  };
}
