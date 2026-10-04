import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { GenesisAccountState } from "@/api/genesis-api";

const runtime = vi.hoisted(() => ({
  genesisApi: { state: vi.fn(), account: vi.fn(), eligibility: vi.fn(), list: vi.fn(), cancel: vi.fn(), buy: vi.fn(), purchase: vi.fn(), commandStatus: vi.fn() },
  sessionVault: { read: () => ({ accessToken: "isolated-test", user: { userId: 7 } }) },
  remoteApiEnabled: true,
}));
vi.mock("@/api/runtime", () => runtime);
vi.mock("@/api/order-api", () => ({ captureRuntimeRevision: () => 1, isCurrentRuntimeRevision: () => true }));
vi.mock("@/store/genesis-config", async (original) => ({
  ...await original<object>(),
  useGenesisConfig: () => ({ config: { tiers: [{ id: "early", from: 0, to: 1000, priceUSDT: 10 }], marketStats: { floor: 0 } } }),
}));
const { useGenesis } = await import("./genesis");
const storage = new Map<string, unknown>();
const receipts = new Map<string, GenesisAccountState>();
let failStorage = false;
let failDeletion = false;
let failRead = false;
let writes = 0;
let price: number | null = null;
let listedAt = 0;
function account(): GenesisAccountState {
  return {
    sourceEnvironment: "PRODUCTION", runId: "", marketEnabled: true, emissionOpen: false,
    series: { seriesCode: "GEN", name: "Genesis", totalSupply: 1000, soldSupply: 1, remainingSupply: 999,
      priceUsdt: 10, royaltyPct: 2.5, dailyEmissionRatePct: 0 },
    sale: { available: true, eligibilityEnabled: true, maxPerUser: 5, minAccountAgeDays: 0,
      presaleEnabled: false, showCountdown: false, unitPriceUsdt: 10, startAt: null, endAt: null, open: true },
    holdings: [{ holdingNo: "GEN-ONE", seriesCode: "GEN", acquiredPriceUsdt: 10, acquiredAt: 1,
      status: price === null ? "ACTIVE" : "LISTED", listingPriceUsdt: price, listedAt }],
    emissions: [], orders: [], walletBalanceUsdt: 100,
    eligibility: { sourceEnvironment: "PRODUCTION", runId: "", eligible: true, reasons: [], ownedCount: 1,
      maxPerUser: 5, remainingCap: 4, minAccountAgeDays: 0, accountAgeDays: 30, holderStatus: "READY",
      reservedAllocation: null, reservedAllocationUnit: "NEX", priorityRank: null, priorityTier: "NONE",
      qualificationReasonCodes: [], policyVersion: "test", effectiveAt: 1, asOf: 1, serverTime: 1,
      provenance: { source: "test", environment: "PRODUCTION", runId: "" } },
  };
}
function execute(_kind: string, key: string, nextPrice: number | null) {
  const existing = receipts.get(key);
  if (existing) return structuredClone(existing);
  price = nextPrice; listedAt += 1; writes += 1;
  const receipt = account(); receipts.set(key, structuredClone(receipt)); return receipt;
}
async function boot() {
  setActivePinia(createPinia()); const store = useGenesis(); store.bindAccount("user:7");
  await store.syncRemote(); return store;
}
beforeEach(() => {
  vi.clearAllMocks(); storage.clear(); receipts.clear(); failStorage = false; failDeletion = false; failRead = false; writes = 0; price = null; listedAt = 0;
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => {
      if (failRead && key === "nexgrid-genesis-accounts-v1") throw new Error("read unavailable");
      return structuredClone(storage.get(key) ?? "");
    },
    setStorageSync: (key: string, value: unknown) => {
      if (failStorage && key === "nexgrid-genesis-accounts-v1") throw new Error("disk unavailable");
      const table = value as Record<string, { marketCommands?: Record<string, unknown> }>;
      if (failDeletion && key === "nexgrid-genesis-accounts-v1" && Object.keys(table["user:7"]?.marketCommands ?? {}).length === 0) {
        throw new Error("deletion write unavailable");
      }
      storage.set(key, JSON.parse(JSON.stringify(value)));
    },
  });
  runtime.genesisApi.state.mockImplementation(async () => ({
    secondaryCommandProtocol: 2,
    series: { totalSupply: 1000, soldSupply: 1, royaltyPct: 2.5 }, halted: false,
    listings: [{ holdingNo: "GEN-ONE", askPriceUsdt: price ?? 10, listedAt, seller: "seller" }],
    transactions: [], marketStats: { floorUsdt: price },
  }));
  runtime.genesisApi.account.mockImplementation(async () => account());
  runtime.genesisApi.eligibility.mockImplementation(async () => account().eligibility);
  runtime.genesisApi.list.mockImplementation(async (_id: string, amount: number, key: string) => execute("list", key, amount));
  runtime.genesisApi.cancel.mockImplementation(async (_id: string, key: string) => execute("cancel", key, null));
  runtime.genesisApi.buy.mockImplementation(async (_id: string, _price: number, key: string) => execute("buy", key, null));
  runtime.genesisApi.purchase.mockImplementation(async () => account());
  runtime.genesisApi.commandStatus.mockImplementation(async (_operation: string, _holding: string, key: string) => receipts.has(key) ? "SUCCEEDED" : "NOT_FOUND");
});
afterEach(() => vi.unstubAllGlobals());

describe("Genesis secondary commands against a server replay cache", () => {
  it("a stale second tab recovers the first tab's unknown command before a new action", async () => {
    const first = await boot(); const second = await boot();
    runtime.genesisApi.list.mockImplementationOnce(async (_id: string, amount: number, key: string) => {
      execute("list", key, amount); throw new Error("response lost");
    });
    expect(await first.listNode("GEN-ONE", 10)).toBe(false);
    expect(await second.cancelListing("GEN-ONE")).toBe("recovered");
    expect(runtime.genesisApi.cancel).not.toHaveBeenCalled();
    expect(writes).toBe(1);
  });
  it("a different store instance cannot write the shared table while another command is in flight", async () => {
    const first = await boot(); const second = await boot();
    let finish!: (value: GenesisAccountState) => void;
    runtime.genesisApi.list.mockImplementationOnce(() => new Promise<GenesisAccountState>((resolve) => { finish = resolve; }));
    const pending = first.listNode("GEN-ONE", 10);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const saved = structuredClone(storage.get("nexgrid-genesis-accounts-v1"));
    expect(await second.cancelListing("GEN-ONE")).toBe(false);
    expect(await second.purchase(1)).toMatchObject({ ok: false, reason: "unavailable" });
    expect(storage.get("nexgrid-genesis-accounts-v1")).toEqual(saved);
    expect(runtime.genesisApi.cancel).not.toHaveBeenCalled();
    expect(runtime.genesisApi.purchase).not.toHaveBeenCalled();
    finish(account()); await pending;
  });
  it("a browser without cross-tab locks refuses writes", async () => {
    vi.stubGlobal("window", {}); vi.stubGlobal("navigator", {});
    const store = await boot();
    expect(await store.listNode("GEN-ONE", 10)).toBe(false);
    expect(runtime.genesisApi.list).not.toHaveBeenCalled();
  });
  it("a primary purchase from a stale tab preserves another tab's pending market command", async () => {
    const first = await boot(); const second = await boot();
    runtime.genesisApi.list.mockRejectedValueOnce(new Error("response lost"));
    await first.listNode("GEN-ONE", 10);
    const before = structuredClone(storage.get("nexgrid-genesis-accounts-v1")) as Record<string, { marketCommands: unknown }>;
    expect(await second.purchase(1)).toMatchObject({ ok: true });
    const after = storage.get("nexgrid-genesis-accounts-v1") as Record<string, { marketCommands: unknown }>;
    expect(after["user:7"].marketCommands).toEqual(before["user:7"].marketCommands);
  });
  it("a failed latest-journal read never becomes an empty journal that authorizes a write", async () => {
    const store = await boot(); failRead = true;
    expect(await store.listNode("GEN-ONE", 10)).toBe(false);
    expect(runtime.genesisApi.list).not.toHaveBeenCalled();
    expect(storage.has("nexgrid-genesis-accounts-v1")).toBe(false);
    failRead = false;
    expect(await store.listNode("GEN-ONE", 10)).toBe(true);
  });
  it("same-price relisting after cancellation is a new operation, including after reload", async () => {
    let store = await boot();
    expect(await store.listNode("GEN-ONE", 10)).toBe(true);
    expect(await store.cancelListing("GEN-ONE")).toBe(true);
    store = await boot();
    expect(await store.listNode("GEN-ONE", 10)).toBe(true);
    expect(price).toBe(10); expect(writes).toBe(3);
    expect(runtime.genesisApi.list.mock.calls[0][2]).not.toBe(runtime.genesisApi.list.mock.calls[1][2]);
  });
  it("a second cancel after a new listing cannot replay the first cancellation", async () => {
    const store = await boot();
    await store.listNode("GEN-ONE", 10); await store.cancelListing("GEN-ONE");
    await store.listNode("GEN-ONE", 20); await store.cancelListing("GEN-ONE");
    expect(price).toBeNull(); expect(writes).toBe(4);
    expect(runtime.genesisApi.cancel.mock.calls[0][1]).not.toBe(runtime.genesisApi.cancel.mock.calls[1][1]);
  });
  it("an unknown result is resolved read-only after reload without replaying a historical mutation", async () => {
    let store = await boot();
    runtime.genesisApi.list.mockImplementationOnce(async (_id: string, amount: number, key: string) => {
      execute("list", key, amount); throw new Error("response lost");
    });
    expect(await store.listNode("GEN-ONE", 10)).toBe(false);
    store = await boot();
    expect(await store.listNode("GEN-ONE", 10)).toBe("recovered");
    expect(writes).toBe(1);
    expect(runtime.genesisApi.list).toHaveBeenCalledTimes(1);
    expect(runtime.genesisApi.commandStatus).toHaveBeenCalledWith("list", "GEN-ONE", runtime.genesisApi.list.mock.calls[0][2], 10);
  });
  it("does not dispatch list, cancel, or buy when pending intent cannot be saved", async () => {
    const store = await boot(); failStorage = true;
    expect(await store.listNode("GEN-ONE", 10)).toBe(false);
    expect(await store.cancelListing("GEN-ONE")).toBe(false);
    expect(await store.acquireSecondary("GEN-ONE", 10)).toBe(false);
    expect(runtime.genesisApi.list).not.toHaveBeenCalled();
    expect(runtime.genesisApi.cancel).not.toHaveBeenCalled(); expect(runtime.genesisApi.buy).not.toHaveBeenCalled();
  });
  it("a successful command receipt remains success when a follow-up public read fails", async () => {
    const store = await boot(); runtime.genesisApi.state.mockRejectedValue(new Error("public read unavailable"));
    runtime.genesisApi.account.mockRejectedValue(new Error("account read unavailable"));
    runtime.genesisApi.eligibility.mockRejectedValue(new Error("eligibility read unavailable"));
    expect(await store.listNode("GEN-ONE", 10)).toBe(true); expect(price).toBe(10);
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
    expect(store.remoteAccountReadState).toBe("ready");
    expect(store.myListings).toEqual([{ tokenId: "GEN-ONE", askPriceUSDT: 10, listedAt: 1 }]);
  });
  it("different devices do not collide even when their local sequence starts at one", async () => {
    let store = await boot(); await store.listNode("GEN-ONE", 10);
    const firstKey = runtime.genesisApi.list.mock.calls[0][2];
    storage.clear(); price = null; store = await boot(); await store.listNode("GEN-ONE", 10);
    expect(runtime.genesisApi.list.mock.calls[1][2]).not.toBe(firstKey);
    expect(runtime.genesisApi.list.mock.calls[1][2].length).toBeLessThanOrEqual(200);
  });
  it("a retirement write failure survives restart and never applies an old receipt over a newer listing", async () => {
    let store = await boot();
    runtime.genesisApi.list.mockImplementationOnce(async (_id: string, amount: number, key: string) => {
      const receipt = execute("list", key, amount); failStorage = true; return receipt;
    });
    expect(await store.listNode("GEN-ONE", 10)).toBe("local-retirement-pending");
    expect(store.myListings[0].askPriceUSDT).toBe(10);
    expect(await store.cancelListing("GEN-ONE")).toBe("local-retirement-pending");
    expect(runtime.genesisApi.cancel).not.toHaveBeenCalled();
    failStorage = false; price = 30; listedAt = 30;
    store = await boot();
    expect(await store.listNode("GEN-ONE", 10)).toBe("recovered");
    expect(store.myListings[0].askPriceUSDT).toBe(30);
    expect(writes).toBe(1); expect(runtime.genesisApi.list).toHaveBeenCalledTimes(1);
    expect(await store.cancelListing("GEN-ONE")).toBe(true);
    expect(await store.listNode("GEN-ONE", 10)).toBe(true);
    expect(writes).toBe(3);
  });
  it.each(["PROCESSING", "UNKNOWN", "NOT_FOUND", "MISMATCH"])("%s blocks a different lifecycle action without replay", async (status) => {
    let store = await boot(); runtime.genesisApi.list.mockRejectedValueOnce(new Error("lost"));
    expect(await store.listNode("GEN-ONE", 10)).toBe(false);
    store = await boot(); runtime.genesisApi.commandStatus.mockResolvedValue(status);
    expect(await store.listNode("GEN-ONE", 20)).toBe(false);
    expect(await store.cancelListing("GEN-ONE")).toBe(false);
    expect(runtime.genesisApi.list).toHaveBeenCalledTimes(1); expect(runtime.genesisApi.cancel).not.toHaveBeenCalled();
  });
  it("locks the holding while a command is in flight even if operation or requested price changes", async () => {
    const store = await boot(); let finish!: (value: GenesisAccountState) => void;
    runtime.genesisApi.list.mockImplementationOnce(() => new Promise<GenesisAccountState>((resolve) => { finish = resolve; }));
    const pending = store.listNode("GEN-ONE", 10);
    expect(await store.listNode("GEN-ONE", 20)).toBe(false);
    expect(await store.cancelListing("GEN-ONE")).toBe(false);
    expect(await store.acquireSecondary("GEN-ONE", 10)).toBe(false);
    finish(account()); await pending;
    expect(runtime.genesisApi.list).toHaveBeenCalledTimes(1); expect(runtime.genesisApi.cancel).not.toHaveBeenCalled();
  });
  it("never sends market commands to a backend without the retained quoted-command protocol", async () => {
    runtime.genesisApi.state.mockResolvedValue({ series: { totalSupply: 1000, soldSupply: 1 }, listings: [], transactions: [], marketStats: {} });
    const store = await boot();
    expect(await store.listNode("GEN-ONE", 10)).toBe(false);
    expect(await store.cancelListing("GEN-ONE")).toBe(false);
    expect(runtime.genesisApi.list).not.toHaveBeenCalled(); expect(runtime.genesisApi.cancel).not.toHaveBeenCalled();
  });
  it("a persisted confirmation with failed deletion recovers with storage and reads only", async () => {
    let store = await boot(); failDeletion = true;
    expect(await store.listNode("GEN-ONE", 10)).toBe("local-retirement-pending");
    const saved = storage.get("nexgrid-genesis-accounts-v1") as Record<string, { marketCommands: Record<string, { state: string }> }>;
    expect(Object.values(saved["user:7"].marketCommands)[0].state).toBe("confirmed");
    failDeletion = false; store = await boot();
    expect(await store.cancelListing("GEN-ONE")).toBe("recovered");
    expect(runtime.genesisApi.commandStatus).not.toHaveBeenCalled(); expect(runtime.genesisApi.cancel).not.toHaveBeenCalled();
    expect(await store.cancelListing("GEN-ONE")).toBe(true);
    expect(writes).toBe(2);
  });
  it("legacy string keys are queried with their original price and retired without a new command", async () => {
    execute("list", "legacy-list", 10); price = null;
    storage.set("nexgrid-genesis-accounts-v1", { "user:7": { myOwned: 1, ownedTokenIds: [], myListings: [],
      idempotencyKeys: { "user:7|list|GEN-ONE:10.000000": "legacy-list" } } });
    const store = await boot();
    expect(await store.listNode("GEN-ONE", 20)).toBe("recovered");
    expect(runtime.genesisApi.commandStatus).toHaveBeenCalledWith("list", "GEN-ONE", "legacy-list", 10);
    expect(runtime.genesisApi.list).not.toHaveBeenCalled(); expect(store.myListings).toEqual([]);
    expect(await store.listNode("GEN-ONE", 20)).toBe(true); expect(price).toBe(20);
  });
  it("a status response after account switch cannot retire the old account's journal", async () => {
    let store = await boot(); runtime.genesisApi.list.mockRejectedValueOnce(new Error("lost"));
    await store.listNode("GEN-ONE", 10); store = await boot();
    let finish!: (value: string) => void;
    runtime.genesisApi.commandStatus.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
    const recovery = store.listNode("GEN-ONE", 10); store.bindAccount("user:8");
    finish("SUCCEEDED"); expect(await recovery).toBe(false);
    const saved = storage.get("nexgrid-genesis-accounts-v1") as Record<string, { marketCommands: Record<string, unknown> }>;
    expect(Object.keys(saved["user:7"].marketCommands)).toHaveLength(1);
  });
  it("corrupt journal data blocks writes without overwriting the recoverable account row", async () => {
    const saved = { "user:7": { myOwned: 1, ownedTokenIds: [], myListings: [], marketCommands: { broken: { version: 2 } } } };
    storage.set("nexgrid-genesis-accounts-v1", structuredClone(saved));
    const store = await boot(); expect(await store.listNode("GEN-ONE", 10)).toBe(false);
    expect(storage.get("nexgrid-genesis-accounts-v1")).toEqual(saved);
    expect(runtime.genesisApi.list).not.toHaveBeenCalled();
  });
});
