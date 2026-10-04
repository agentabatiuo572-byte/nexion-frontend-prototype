import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { RepurchaseConfig, RepurchaseSnapshot, RepurchaseStatus } from "@/api/repurchase-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  repurchaseApi: {
    fetchConfig: vi.fn(),
    fetchOrders: vi.fn(),
    open: vi.fn(),
    claim: vi.fn(),
    earlyWithdraw: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useRepurchase } = await import("./repurchase");

const config: RepurchaseConfig = {
  apyPct: 35,
  lockDays: 90,
  nurtureMultiplier: 1.5,
  h1ReinvestMultiplier: 1,
  effectiveNurtureMultiplier: 1.5,
  ticketPerOrder: 1,
  presets: [100],
  earlyPenaltyPct: 15,
  minAmountUsdt: 20,
  enabled: true,
  disclosureRequired: false,
  currentNexPriceUsdt: 0.02,
  g4LotteryCapacity: 10,
  g4TicketsIssuedThisMonth: 1,
  sourceEnvironment: "PRODUCTION",
  runId: "",
};

function snapshot(account = "A", status: RepurchaseStatus = "MATURE_UNCLAIMED"): RepurchaseSnapshot {
  return {
    orders: [{
      orderNo: `R-${account}`,
      amountUsdt: 100,
      apyPct: 35,
      earlyPenaltyPct: 15,
      lockDays: 90,
      lockedAt: 1,
      unlockAt: 2,
      estimatedInterestUsdt: 10,
      status,
    }],
    ordersPage: { total: 1, pageNum: 1, pageSize: 50 },
    walletBalanceUsdt: account === "A" ? 500 : 700,
    serverTime: 1,
    sourceEnvironment: "PRODUCTION",
    runId: "",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  const storage = new Map<string, unknown>();
  vi.stubGlobal("uni", {
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, structuredClone(value))),
  });
  setActivePinia(createPinia());
  for (const method of Object.values(remote.repurchaseApi)) method.mockReset();
  remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
  remote.repurchaseApi.fetchOrders.mockResolvedValue(snapshot());
});

describe("repurchase order actions", () => {
  it("serializes a claimed order, renders the acknowledged status, and rejects a double action", async () => {
    const receipt = snapshot();
    receipt.orders[0].status = "CLAIMED";
    const claim = deferred<RepurchaseSnapshot>();
    remote.repurchaseApi.claim.mockReturnValue(claim.promise);
    const store = useRepurchase();
    store.bindAccount("account-a");
    await store.refresh();

    const first = store.claim("R-A");
    await flush();
    await expect(store.earlyWithdraw("R-A")).rejects.toThrow("REPURCHASE_COMMAND_IN_PROGRESS");
    expect(store.submitting).toBe(true);

    claim.resolve(receipt);
    await expect(first).resolves.toEqual(receipt);
    expect(remote.repurchaseApi.claim).toHaveBeenCalledWith("R-A", expect.stringMatching(/^g7-claim-/));
    expect(store.orders[0]?.status).toBe("CLAIMED");
    expect(store.submitting).toBe(false);
  });

  it("preserves the canonical order list after an early-withdraw failure", async () => {
    remote.repurchaseApi.earlyWithdraw.mockRejectedValue(new Error("EARLY_WITHDRAW_REJECTED"));
    remote.repurchaseApi.fetchOrders.mockResolvedValue(snapshot("A", "ACTIVE"));
    const store = useRepurchase();
    store.bindAccount("account-a");
    await store.refresh();

    await expect(store.earlyWithdraw("R-A")).rejects.toThrow("EARLY_WITHDRAW_REJECTED");
    expect(store.orders[0]).toMatchObject({ orderNo: "R-A", status: "ACTIVE" });
    expect(store.walletBalanceUsdt).toBe(500);
    expect(store.submitting).toBe(false);
  });

  it("rejects a late order receipt after an account switch without leaking it into B", async () => {
    const claim = deferred<RepurchaseSnapshot>();
    remote.repurchaseApi.claim.mockReturnValue(claim.promise);
    const store = useRepurchase();
    store.bindAccount("account-a");
    await store.refresh();

    const pending = store.claim("R-A");
    store.bindAccount("account-b");
    remote.repurchaseApi.fetchOrders.mockResolvedValue(snapshot("B", "ACTIVE"));
    await store.refresh();
    claim.resolve({ ...snapshot(), walletBalanceUsdt: 1, orders: [{ ...snapshot().orders[0], status: "CLAIMED" }] });

    await expect(pending).rejects.toThrow("REPURCHASE_ACCOUNT_CHANGED");
    expect(store.orders[0]).toMatchObject({ orderNo: "R-B", status: "ACTIVE" });
    expect(store.walletBalanceUsdt).toBe(700);
  });
});
