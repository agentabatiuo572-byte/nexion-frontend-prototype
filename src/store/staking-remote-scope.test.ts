import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { StakingPool, StakingSnapshot } from "@/api/staking-api";
import { ApiError } from "@/api/errors";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  apiRuntimeConfig: { environment: "prod", mode: "prod" },
  stakingApi: {
    fetchStakingPools: vi.fn(),
    fetchStakingPositions: vi.fn(),
    openStakingPosition: vi.fn(),
    claimStakingPosition: vi.fn(),
    earlyWithdrawStakingPosition: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useStaking } = await import("./staking");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function pool(account: string): StakingPool {
  return {
    poolId: account === "A" ? 1 : 2,
    tierKey: "usdt30d",
    currency: "USDT",
    termDays: 30,
    apy: account === "A" ? 0.12 : 0.22,
    penalty: account === "A" ? 0.05 : 0.07,
    minAmountUsdt: account === "A" ? 20 : 30,
    enabled: true,
    killed: false,
    status: "ACTIVE",
    sourceEnvironment: "PRODUCTION",
    runId: "",
  };
}

function snapshot(account: string): StakingSnapshot {
  const now = Date.now();
  return {
    positions: [{
      id: `${account}-position`,
      tierKey: "usdt30d",
      productCode: `POOL-${account}`,
      productName: `Pool ${account}`,
      amountUSDT: account === "A" ? 100 : 200,
      termDays: 30,
      apy: account === "A" ? 0.12 : 0.22,
      penalty: account === "A" ? 0.05 : 0.07,
      startTs: now - 1000,
      unlockTs: now + 1000,
      estimatedInterestUsdt: 1,
      status: "active",
    }],
    positionsPage: { total: 1, pageNum: 1, pageSize: 50 },
    walletBalanceUsdt: account === "A" ? 1000 : 2000,
    serverTime: now,
    sourceEnvironment: "PRODUCTION",
    runId: "",
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function bindReady(store: ReturnType<typeof useStaking>) {
  remote.stakingApi.fetchStakingPools.mockResolvedValue([pool("A")]);
  remote.stakingApi.fetchStakingPositions.mockResolvedValue(snapshot("A"));
  store.bindAccount("A");
  await flush();
  expect(store.remoteReady).toBe(true);
}

beforeEach(() => {
  setActivePinia(createPinia());
  for (const method of Object.values(remote.stakingApi)) method.mockReset();
});

describe("staking remote account scope", () => {
  it("drops a late sync response after switching accounts", async () => {
    const poolA = deferred<StakingPool[]>();
    const snapshotA = deferred<StakingSnapshot>();
    const poolB = deferred<StakingPool[]>();
    const snapshotB = deferred<StakingSnapshot>();
    remote.stakingApi.fetchStakingPools
      .mockReturnValueOnce(poolA.promise)
      .mockReturnValueOnce(poolB.promise);
    remote.stakingApi.fetchStakingPositions
      .mockReturnValueOnce(snapshotA.promise)
      .mockReturnValueOnce(snapshotB.promise);
    const store = useStaking();

    store.bindAccount("A");
    store.bindAccount("B");
    poolB.resolve([pool("B")]);
    snapshotB.resolve(snapshot("B"));
    await flush();
    poolA.resolve([pool("A")]);
    snapshotA.resolve(snapshot("A"));
    await flush();

    expect(store.pools[0]?.poolId).toBe(2);
    expect(store.positions[0]?.id).toBe("B-position");
    expect(store.walletBalanceUsdt).toBe(2000);
  });

  it("drops a late open response after switching accounts", async () => {
    const store = useStaking();
    await bindReady(store);
    const openA = deferred<StakingSnapshot>();
    remote.stakingApi.openStakingPosition.mockReturnValue(openA.promise);
    const pending = store.openRemote("usdt30d", 100, "open-A");

    remote.stakingApi.fetchStakingPools.mockResolvedValue([pool("B")]);
    remote.stakingApi.fetchStakingPositions.mockResolvedValue(snapshot("B"));
    store.bindAccount("B");
    await flush();
    openA.resolve(snapshot("A"));

    await expect(pending).rejects.toThrow("G1_REMOTE_AUTHORITY_UNAVAILABLE");
    expect(store.pools[0]?.poolId).toBe(2);
    expect(store.positions[0]?.id).toBe("B-position");
  });

  it.each([
    ["claim", "claimStakingPosition"],
    ["early withdraw", "earlyWithdrawStakingPosition"],
  ] as const)("drops a late %s response after switching accounts", async (_label, method) => {
    const store = useStaking();
    await bindReady(store);
    const mutationA = deferred<StakingSnapshot>();
    remote.stakingApi[method].mockReturnValue(mutationA.promise);
    const pending = method === "claimStakingPosition"
      ? store.claimRemote("A-position", "claim-A")
      : store.earlyWithdrawRemote("A-position", "early-A");

    remote.stakingApi.fetchStakingPools.mockResolvedValue([pool("B")]);
    remote.stakingApi.fetchStakingPositions.mockResolvedValue(snapshot("B"));
    store.bindAccount("B");
    await flush();
    mutationA.resolve(snapshot("A"));

    await expect(pending).rejects.toThrow("G1_REMOTE_AUTHORITY_UNAVAILABLE");
    expect(store.pools[0]?.poolId).toBe(2);
    expect(store.positions[0]?.id).toBe("B-position");
  });

  it("does not let an older sync overwrite a confirmed mutation", async () => {
    const store = useStaking();
    await bindReady(store);
    const stalePools = deferred<StakingPool[]>();
    const staleSnapshot = deferred<StakingSnapshot>();
    remote.stakingApi.fetchStakingPools.mockReturnValueOnce(stalePools.promise);
    remote.stakingApi.fetchStakingPositions.mockReturnValueOnce(staleSnapshot.promise);
    const staleRead = store.syncRemote();

    const claimed = { ...snapshot("A"), positions: [] };
    remote.stakingApi.claimStakingPosition.mockResolvedValue(claimed);
    await expect(store.claimRemote("A-position", "claim-A")).resolves.toEqual(claimed);
    stalePools.resolve([pool("A")]);
    staleSnapshot.resolve(snapshot("A"));
    await staleRead;

    expect(store.positions).toEqual([]);
    expect(store.remoteReady).toBe(true);
  });

  it("reconciles after reverse-order concurrent mutation responses", async () => {
    const store = useStaking();
    await bindReady(store);
    const claim = deferred<StakingSnapshot>();
    const withdraw = deferred<StakingSnapshot>();
    remote.stakingApi.claimStakingPosition.mockReturnValue(claim.promise);
    remote.stakingApi.earlyWithdrawStakingPosition.mockReturnValue(withdraw.promise);
    const authoritative = { ...snapshot("A"), positions: [], walletBalanceUsdt: 1300 };
    remote.stakingApi.fetchStakingPools.mockResolvedValue([pool("A")]);
    remote.stakingApi.fetchStakingPositions.mockResolvedValue(authoritative);

    const olderStarted = store.claimRemote("A-position", "claim-A");
    const newerStarted = store.earlyWithdrawRemote("A-other-position", "withdraw-B");
    withdraw.resolve({ ...snapshot("A"), walletBalanceUsdt: 1100 });
    await newerStarted;
    claim.resolve({ ...snapshot("A"), walletBalanceUsdt: 1200 });
    await olderStarted;

    expect(remote.stakingApi.fetchStakingPositions).toHaveBeenCalledTimes(2);
    expect(store.positions).toEqual([]);
    expect(store.walletBalanceUsdt).toBe(1300);
  });

  it("preserves a deterministic business rejection and the last good snapshot", async () => {
    const store = useStaking();
    await bindReady(store);
    const rejection = new ApiError({
      kind: "business",
      status: 409,
      message: "STAKING_POSITION_NOT_MATURE",
    });
    remote.stakingApi.claimStakingPosition.mockRejectedValue(rejection);

    await expect(store.claimRemote("A-position", "claim-A")).rejects.toBe(rejection);

    expect(store.positions[0]?.id).toBe("A-position");
    expect(store.walletBalanceUsdt).toBe(1000);
    expect(store.remoteError).toBe("STAKING_POSITION_NOT_MATURE");
    expect(store.remoteReady).toBe(true);
  });
});
