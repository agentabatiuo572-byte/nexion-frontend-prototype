import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { PayoutAddressOtpChallenge, PayoutAddressRow, PayoutAddressSnapshot } from "@/api/payout-address-api";

const remote = vi.hoisted(() => ({
  apiRuntimeConfig: { environment: "prod", mode: "prod" },
  remoteApiEnabled: false,
  sandboxRunCurrent: true,
  payoutAddressServerEnabled: true,
  payoutAddressApi: {
    list: vi.fn(),
    sendOtp: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);
vi.mock("./account-scoped-storage", () => ({
  readAccountRow: vi.fn(() => null),
  writeAccountRow: vi.fn(() => true),
}));
vi.mock("./risk-identity", () => ({ recordWithdrawAddressUse: vi.fn() }));
vi.mock("@/lib/money-receipt", () => ({ postMoneyBillsOnce: vi.fn(() => "ok") }));
vi.mock("@/api/order-api", () => ({
  captureRuntimeRevision: vi.fn(() => ({ runId: null, epoch: 0 })),
  isCurrentRuntimeRevision: vi.fn(() => remote.sandboxRunCurrent),
}));

const { usePayoutAddress } = await import("./payout-address");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function row(account: string): PayoutAddressRow & { source: "server"; sourceEnvironment: "PRODUCTION"; runId: ""; serverCanonical: true } {
  return {
    network: "USDT-TRC20",
    address: `T${account.repeat(33).slice(0, 33)}`,
    status: "ACTIVE",
    effectiveAt: "2026-08-17T00:00:00",
    createdAt: "2026-08-16T00:00:00",
    nextChangeAllowedAt: "2026-08-23T00:00:00",
    changePending: true,
    source: "server",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    serverCanonical: true,
  };
}

function snapshot(account: string): PayoutAddressSnapshot {
  return {
    addresses: [row(account)],
    serverNowEpochMs: 1_800_000_000_000,
    source: "server",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    serverCanonical: true,
    changeCooldownDays: 7,
    effectiveDelayHours: 24,
    inFlightWithdrawalBlocked: true,
  };
}

function challenge(): PayoutAddressOtpChallenge {
  return {
    challengeNo: "PAYOUT-ABC123",
    expiresInSeconds: 300,
    source: "server",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    serverCanonical: true,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const saveInput = {
  network: "usdt-trc20" as const,
  address: `T${"B".repeat(33)}`,
  challengeNo: "PAYOUT-ABC123",
  code: "123456",
  idempotencyKey: "payout-A",
};

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  setActivePinia(createPinia());
  remote.payoutAddressApi.list.mockReset();
  remote.payoutAddressApi.sendOtp.mockReset();
  remote.payoutAddressApi.save.mockReset();
  remote.apiRuntimeConfig.environment = "prod";
  remote.sandboxRunCurrent = true;
});

describe("payout address remote account scope", () => {
  it("keeps an address visible without a monotonic clock and recovers on a new snapshot", async () => {
    vi.stubGlobal("performance", undefined);
    remote.payoutAddressApi.list.mockResolvedValue(snapshot("A"));
    const store = usePayoutAddress();
    store.bindAccount("A");
    await flush();
    expect(store.currentFor("usdt-trc20")?.address).toBe(row("A").address);
    expect(store.serverClock).toBeNull();
    vi.stubGlobal("performance", { now: () => 100 });
    expect(store.changeBlockReason("usdt-trc20", 1_800_000_000_000)).toBe("time-unknown");
    await store.refreshRemote();
    expect(store.serverClock?.receivedMonotonicAt).toBe(100);
    for (const bad of [NaN, Infinity, -1, null, undefined]) {
      expect(store.changeBlockReason("usdt-trc20", bad)).toBe("time-unknown");
    }
    expect(store.changeBlockReason("usdt-trc20", 1_800_000_000_000)).toBeNull();
  });
  it("keeps a legacy address visible but never opens a time-gated change", async () => {
    const legacy = snapshot("A");
    legacy.serverNowEpochMs = null;
    remote.payoutAddressApi.list.mockResolvedValueOnce(legacy);
    const store = usePayoutAddress();

    store.bindAccount("A");
    await flush();

    expect(store.currentFor("usdt-trc20")?.address).toBe(row("A").address);
    expect(store.serverClock).toBeNull();
    expect(store.changeBlockReason("usdt-trc20", null)).toBe("time-unknown");
  });

  it("recovers a closed time gate only after a later canonical snapshot has a clock", async () => {
    const legacy = snapshot("A");
    legacy.serverNowEpochMs = null;
    remote.payoutAddressApi.list.mockResolvedValueOnce(legacy).mockResolvedValueOnce({
      ...snapshot("A"),
    });
    const store = usePayoutAddress();

    store.bindAccount("A");
    await flush();
    expect(store.changeBlockReason("usdt-trc20", null)).toBe("time-unknown");

    await expect(store.refreshRemote()).resolves.toBe(true);
    expect(store.serverClock).not.toBeNull();
    expect(store.changeBlockReason("usdt-trc20", store.serverClock?.serverNowEpochMs)).toBeNull();
  });

  it("drops a late list success after switching accounts", async () => {
    const listA = deferred<PayoutAddressSnapshot>();
    const listB = deferred<PayoutAddressSnapshot>();
    remote.payoutAddressApi.list.mockReturnValueOnce(listA.promise).mockReturnValueOnce(listB.promise);
    const store = usePayoutAddress();

    store.bindAccount("A");
    store.bindAccount("B");
    listB.resolve(snapshot("B"));
    await flush();
    listA.resolve(snapshot("A"));
    await flush();

    expect(store.currentFor("usdt-trc20")?.address).toBe(row("B").address);
  });

  it("drops a late list failure after switching accounts", async () => {
    const listA = deferred<PayoutAddressSnapshot>();
    const listB = deferred<PayoutAddressSnapshot>();
    remote.payoutAddressApi.list.mockReturnValueOnce(listA.promise).mockReturnValueOnce(listB.promise);
    const store = usePayoutAddress();

    store.bindAccount("A");
    store.bindAccount("B");
    listB.resolve(snapshot("B"));
    await flush();
    listA.reject(new Error("A_LIST_FAILED"));
    await expect(flush()).resolves.toBeUndefined();

    expect(store.currentFor("usdt-trc20")?.address).toBe(row("B").address);
  });

  it("rejects a late OTP success or failure without exposing the old result", async () => {
    remote.payoutAddressApi.list.mockResolvedValue(snapshot("B"));
    const otpA = deferred<PayoutAddressOtpChallenge>();
    remote.payoutAddressApi.sendOtp.mockReturnValueOnce(otpA.promise);
    const store = usePayoutAddress();

    store.bindAccount("A");
    const pendingSuccess = store.sendRemoteOtp();
    store.bindAccount("B");
    otpA.resolve(challenge());
    await expect(pendingSuccess).rejects.toThrow("PAYOUT_ADDRESS_ACCOUNT_SCOPE_CHANGED");

    const otpFailure = deferred<PayoutAddressOtpChallenge>();
    remote.payoutAddressApi.sendOtp.mockReturnValueOnce(otpFailure.promise);
    const pendingFailure = store.sendRemoteOtp();
    store.bindAccount("A");
    otpFailure.reject(new Error("B_OTP_FAILED"));
    await expect(pendingFailure).rejects.toThrow("PAYOUT_ADDRESS_ACCOUNT_SCOPE_CHANGED");
  });

  it("does not start a stale save readback after switching accounts", async () => {
    remote.payoutAddressApi.list.mockResolvedValue(snapshot("B"));
    const savedA = deferred<ReturnType<typeof row>>();
    remote.payoutAddressApi.save.mockReturnValueOnce(savedA.promise);
    const store = usePayoutAddress();

    store.bindAccount("A");
    const pending = store.saveRemoteAddress(saveInput);
    store.bindAccount("B");
    await flush();
    const listCallsBeforeSaveResolution = remote.payoutAddressApi.list.mock.calls.length;
    savedA.resolve(row("A"));

    await expect(pending).rejects.toThrow("PAYOUT_ADDRESS_ACCOUNT_SCOPE_CHANGED");
    expect(remote.payoutAddressApi.list.mock.calls.length).toBe(listCallsBeforeSaveResolution);
    expect(store.currentFor("usdt-trc20")?.address).toBe(row("B").address);
  });

  it("discards a stale save failure after switching accounts", async () => {
    remote.payoutAddressApi.list.mockResolvedValue(snapshot("B"));
    const saveA = deferred<ReturnType<typeof row>>();
    remote.payoutAddressApi.save.mockReturnValueOnce(saveA.promise);
    const store = usePayoutAddress();

    store.bindAccount("A");
    const pending = store.saveRemoteAddress(saveInput);
    store.bindAccount("B");
    await flush();
    saveA.reject(new Error("A_SAVE_FAILED"));

    await expect(pending).rejects.toThrow("PAYOUT_ADDRESS_ACCOUNT_SCOPE_CHANGED");
    expect(store.currentFor("usdt-trc20")?.address).toBe(row("B").address);
  });

  it("rejects a sandbox-shaped payout snapshot in formal dev", async () => {
    remote.apiRuntimeConfig.environment = "dev";
    const listA = deferred<PayoutAddressSnapshot>();
    remote.payoutAddressApi.list.mockReturnValueOnce(listA.promise);
    const store = usePayoutAddress();
    store.bindAccount("A");
    remote.sandboxRunCurrent = false;
    listA.resolve({
      ...snapshot("A"), source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-1",
      addresses: [{ ...row("A"), source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-1" }],
    } as unknown as PayoutAddressSnapshot);
    await flush();
    expect(store.currentFor("usdt-trc20")?.address).toBeUndefined();
  });
});
