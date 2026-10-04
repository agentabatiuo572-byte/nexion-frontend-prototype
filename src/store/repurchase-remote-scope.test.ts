import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { RepurchaseConfig, RepurchaseSnapshot } from "@/api/repurchase-api";
import { ApiError } from "@/api/errors";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  apiRuntimeConfig: { environment: "prod", mode: "prod" },
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
  presets: [100, 250],
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

const snapshot: RepurchaseSnapshot = {
  orders: [],
  ordersPage: { total: 0, pageNum: 1, pageSize: 50 },
  walletBalanceUsdt: 500,
  serverTime: Date.now(),
  sourceEnvironment: "PRODUCTION",
  runId: "",
};

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
});

describe("repurchase remote authority", () => {
  function manyOrders(): RepurchaseSnapshot {
    return {
      ...snapshot,
      orders: Array.from({ length: 101 }, (_, index) => ({
        orderNo: `R-${index}`, amountUsdt: 100, apyPct: 35, earlyPenaltyPct: 15,
        lockDays: 90, lockedAt: 1, unlockAt: 2, estimatedInterestUsdt: 10,
        status: "CLAIMED" as const,
      })),
      ordersPage: { total: 101, pageNum: 3, pageSize: 50 },
    };
  }

  it.each(["open", "claim", "earlyWithdraw"] as const)("rehydrates every order after a paginated %s receipt", async (action) => {
    const full = manyOrders();
    const receipt = { ...full, orders: full.orders.slice(0, 100), ordersPage: { total: 101, pageNum: 1, pageSize: 100 } };
    remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(full);
    remote.repurchaseApi[action].mockResolvedValue(receipt);
    const store = useRepurchase();
    store.bindAccount("account-a");
    await store.refresh();
    remote.repurchaseApi.fetchOrders.mockClear();
    if (action === "open") await store.open(100);
    else await store[action]("R-0");
    expect(remote.repurchaseApi.fetchOrders).toHaveBeenCalledTimes(1);
    expect(store.orders).toHaveLength(101);
    expect(store.orders[100].orderNo).toBe("R-100");
  });

  it("keeps the acknowledged command successful when the full history read fails", async () => {
    const full = manyOrders();
    const receipt = { ...full, orders: full.orders.slice(0, 100), ordersPage: { total: 101, pageNum: 1, pageSize: 100 } };
    remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(full);
    remote.repurchaseApi.open.mockResolvedValue(receipt);
    const store = useRepurchase();
    store.bindAccount("account-a");
    await store.refresh();
    remote.repurchaseApi.fetchOrders.mockRejectedValue(new Error("history unavailable"));
    await expect(store.open(100)).resolves.toEqual(receipt);
    expect(store.pendingOpenAmount).toBeNull();
    expect(store.error).toBe("");
    expect(store.historyError).toBe("history unavailable");
    expect(store.historyLoading).toBe(false);
    expect(store.loading).toBe(false);
    expect(store.walletBalanceUsdt).toBe(receipt.walletBalanceUsdt);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(full);
    await store.refreshHistory();
    expect(store.orders).toHaveLength(101);
    expect(store.historyError).toBe("");
    expect(remote.repurchaseApi.open).toHaveBeenCalledTimes(1);
  });

  it.each(["account", "refresh"])("ignores a late history read superseded by %s", async (superseding) => {
    const full = manyOrders();
    const receipt = { ...full, orders: full.orders.slice(0, 100) };
    remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(full);
    remote.repurchaseApi.open.mockResolvedValue(receipt);
    const store = useRepurchase();
    store.bindAccount("account-a");
    await store.refresh();
    let finish!: (value: RepurchaseSnapshot) => void;
    remote.repurchaseApi.fetchOrders.mockReturnValueOnce(new Promise<RepurchaseSnapshot>((resolve) => { finish = resolve; }));
    const command = store.open(100);
    await flush();
    expect(store.historyLoading).toBe(true);
    remote.repurchaseApi.fetchOrders.mockResolvedValue({ ...snapshot, walletBalanceUsdt: 123 });
    if (superseding === "account") store.bindAccount("account-b");
    await store.refresh();
    finish(full);
    await command;
    expect(store.walletBalanceUsdt).toBe(123);
    expect(store.orders).toEqual([]);
    expect(store.historyLoading).toBe(false);
    expect(store.loading).toBe(false);
  });

  it("clears a superseded history retry when a later command supplies a complete receipt", async () => {
    remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(snapshot);
    remote.repurchaseApi.open.mockResolvedValue({ ...snapshot, walletBalanceUsdt: 400 });
    const store = useRepurchase();
    store.bindAccount("account-a");
    await store.refresh();
    let finish!: (value: RepurchaseSnapshot) => void;
    remote.repurchaseApi.fetchOrders.mockReturnValueOnce(new Promise<RepurchaseSnapshot>((resolve) => { finish = resolve; }));
    const history = store.refreshHistory();
    expect(store.historyLoading).toBe(true);
    await store.open(100);
    expect(store.historyLoading).toBe(false);
    finish(snapshot);
    await history;
    expect(store.walletBalanceUsdt).toBe(400);
    expect(store.historyError).toBe("");
  });

  it("opens only through the server API after a canonical refresh", async () => {
    remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(snapshot);
    remote.repurchaseApi.open.mockResolvedValue({
      ...snapshot,
      walletBalanceUsdt: 300,
      focusOrderNo: "R-1",
    });
    const store = useRepurchase();
    store.bindAccount("account-a");

    await store.refresh();
    await store.open(200);

    expect(remote.repurchaseApi.open).toHaveBeenCalledWith(200, expect.stringMatching(/^g7-open-/));
    expect(store.walletBalanceUsdt).toBe(300);
  });

  it("keeps the product unavailable when the backend is HOLD/503", async () => {
    remote.repurchaseApi.fetchConfig.mockRejectedValue(new Error("REPURCHASE_HOLD"));
    remote.repurchaseApi.fetchOrders.mockRejectedValue(new Error("503"));
    const store = useRepurchase();

    await store.refresh();
    await flush();

    expect(store.config).toBeNull();
    expect(store.orders).toEqual([]);
    expect(store.walletBalanceUsdt).toBe(0);
    expect(remote.repurchaseApi.open).not.toHaveBeenCalled();
  });

  it("keeps the last canonical screen usable when a command is rejected", async () => {
    remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(snapshot);
    remote.repurchaseApi.open.mockRejectedValue(new ApiError({ kind: "business", message: "DISCLOSURE_REQUIRED" }));
    const store = useRepurchase();
    store.bindAccount("account-a");

    await store.refresh();
    await expect(store.open(200)).rejects.toThrow("DISCLOSURE_REQUIRED");

    expect(store.config).toEqual(config);
    expect(store.walletBalanceUsdt).toBe(500);
    expect(store.error).toBe("");
    expect(store.pendingOpenAmount).toBeNull();
  });

  it("restores the original amount and key after a lost response and App restart, even after balance decreased", async () => {
    remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(snapshot);
    remote.repurchaseApi.open.mockRejectedValueOnce(new Error("response lost"));
    const first = useRepurchase();
    first.bindAccount("account-a");
    await first.refresh();
    await expect(first.open(400)).rejects.toThrow("response lost");
    const key = remote.repurchaseApi.open.mock.calls[0][1];

    setActivePinia(createPinia());
    remote.repurchaseApi.fetchOrders.mockResolvedValue({ ...snapshot, walletBalanceUsdt: 100 });
    remote.repurchaseApi.open.mockResolvedValue({ ...snapshot, walletBalanceUsdt: 100 });
    const restored = useRepurchase();
    restored.bindAccount("account-a");
    await restored.refresh();
    expect(restored.pendingOpenAmount).toBe(400);
    await expect(restored.open(100)).rejects.toThrow("REPURCHASE_PENDING_RECOVERY_REQUIRED");
    await restored.open(400);
    expect(remote.repurchaseApi.open).toHaveBeenLastCalledWith(400, key);
    expect(remote.repurchaseApi.open).toHaveBeenCalledTimes(2);
    expect(restored.pendingOpenAmount).toBeNull();
  });

  it("does not discard an unknown earlier commit when a later replay is rejected", async () => {
    remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(snapshot);
    remote.repurchaseApi.open.mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new ApiError({ kind: "business", message: "PRODUCT_DISABLED" }));
    const store = useRepurchase();
    store.bindAccount("account-a");
    await store.refresh();
    await expect(store.open(200)).rejects.toThrow();
    await expect(store.open(200)).rejects.toThrow();
    expect(store.pendingOpenAmount).toBe(200);
    expect(remote.repurchaseApi.open.mock.calls[1][1]).toBe(remote.repurchaseApi.open.mock.calls[0][1]);
  });

  it("never posts when durable storage is unavailable", async () => {
    remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(snapshot);
    const store = useRepurchase();
    store.bindAccount("account-a");
    await store.refresh();
    vi.mocked(uni.setStorageSync).mockImplementation(() => { throw new Error("disk full"); });
    await expect(store.open(200)).rejects.toThrow("REMOTE_INTENT_PERSIST_FAILED");
    expect(remote.repurchaseApi.open).not.toHaveBeenCalled();
  });

  it("isolates unresolved operations and late receipts from another account", async () => {
    remote.repurchaseApi.fetchConfig.mockResolvedValue(config);
    remote.repurchaseApi.fetchOrders.mockResolvedValue(snapshot);
    let finish!: (value: RepurchaseSnapshot) => void;
    remote.repurchaseApi.open.mockReturnValue(new Promise<RepurchaseSnapshot>((resolve) => { finish = resolve; }));
    const store = useRepurchase();
    store.bindAccount("account-a");
    await store.refresh();
    const pending = store.open(200);
    store.bindAccount("account-b");
    await store.refresh();
    expect(store.pendingOpenAmount).toBeNull();
    finish({ ...snapshot, walletBalanceUsdt: 300 });
    await expect(pending).rejects.toThrow("REPURCHASE_ACCOUNT_CHANGED");
    expect(store.walletBalanceUsdt).toBe(500);
    store.bindAccount("account-a");
    expect(store.pendingOpenAmount).toBe(200);
  });
});
