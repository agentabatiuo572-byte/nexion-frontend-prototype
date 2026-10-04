import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { StreakPowerUpId } from "./daily-powerup";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  pointsApi: {
    state: vi.fn(),
    activatePowerUp: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useDailyPowerUp } = await import("./daily-powerup");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function powerUp(account: string, status: "AVAILABLE" | "ACTIVATED" = "AVAILABLE") {
  const powerUpCode: StreakPowerUpId = account === "A" ? "staking_boost" : "nex_boost";
  return {
    powerUpId: account === "A" ? 11 : 22,
    powerUpCode,
    name: `${account} power-up`,
    unlockStreakDays: 1,
    targetPath: "/home",
    effectType: "NEX_MULTIPLIER",
    effectValue: "1.1",
    status,
  };
}

function snapshot(account: string, status: "AVAILABLE" | "ACTIVATED" = "AVAILABLE") {
  return { powerUps: [powerUp(account, status)] };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function createStore() {
  remote.pointsApi.state.mockResolvedValue({ powerUps: [] });
  const store = useDailyPowerUp();
  await flush();
  remote.pointsApi.state.mockReset();
  remote.pointsApi.activatePowerUp.mockReset();
  return store;
}

beforeEach(() => {
  setActivePinia(createPinia());
  remote.pointsApi.state.mockReset();
  remote.pointsApi.activatePowerUp.mockReset();
});

describe("daily power-up remote account scope", () => {
  it("drops a late state success after switching accounts", async () => {
    const store = await createStore();
    const stale = deferred<ReturnType<typeof snapshot>>();
    remote.pointsApi.state
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(snapshot("B"));

    store.bindAccount("A");
    store.bindAccount("B");
    await flush();
    expect(store.hasClaimed("nex_boost")).toBe(false);

    stale.resolve(snapshot("A", "ACTIVATED"));
    await flush();

    expect(store.hasClaimed("nex_boost")).toBe(false);
    expect(store.hasClaimed("staking_boost")).toBe(false);
  });

  it("drops a late state failure without clearing the next account", async () => {
    const store = await createStore();
    const stale = deferred<ReturnType<typeof snapshot>>();
    remote.pointsApi.state
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(snapshot("B", "ACTIVATED"));

    store.bindAccount("A");
    store.bindAccount("B");
    await flush();
    expect(store.hasClaimed("nex_boost")).toBe(true);
    stale.reject(new Error("account A failed"));
    await flush();

    expect(store.hasClaimed("nex_boost")).toBe(true);
    expect(store.hasClaimed("staking_boost")).toBe(false);
  });

  it("does not read back a stale activation after switching accounts", async () => {
    const store = await createStore();
    remote.pointsApi.state.mockResolvedValue(snapshot("A"));
    store.bindAccount("A");
    await flush();

    const activation = deferred<{ powerUpId: number; powerUpCode: string; status: "ACTIVATED" }>();
    remote.pointsApi.activatePowerUp.mockReturnValue(activation.promise);
    remote.pointsApi.state.mockResolvedValue(snapshot("B", "ACTIVATED"));
    const pending = store.claimRemote("staking_boost");

    store.bindAccount("B");
    await flush();
    expect(store.hasClaimed("nex_boost")).toBe(true);
    const stateCallsAfterRebind = remote.pointsApi.state.mock.calls.length;
    activation.resolve({ powerUpId: 11, powerUpCode: "staking_boost", status: "ACTIVATED" });

    await expect(pending).resolves.toBe(false);
    await flush();
    expect(remote.pointsApi.state).toHaveBeenCalledTimes(stateCallsAfterRebind);
    expect(store.hasClaimed("staking_boost")).toBe(false);
    expect(store.hasClaimed("nex_boost")).toBe(true);
  });

  it("drops a stale activation failure without changing the next account", async () => {
    const store = await createStore();
    remote.pointsApi.state.mockResolvedValue(snapshot("A"));
    store.bindAccount("A");
    await flush();

    const activation = deferred<{ powerUpId: number; powerUpCode: string; status: "ACTIVATED" }>();
    remote.pointsApi.activatePowerUp.mockReturnValue(activation.promise);
    remote.pointsApi.state.mockResolvedValue(snapshot("B", "ACTIVATED"));
    const pending = store.claimRemote("staking_boost");

    store.bindAccount("B");
    await flush();
    expect(store.hasClaimed("nex_boost")).toBe(true);
    activation.reject(new Error("account A failed"));

    await expect(pending).resolves.toBe(false);
    expect(store.hasClaimed("staking_boost")).toBe(false);
    expect(store.hasClaimed("nex_boost")).toBe(true);
  });
});
