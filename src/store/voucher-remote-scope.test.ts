import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, disposePinia, setActivePinia } from "pinia";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  voucherApi: {
    state: vi.fn(),
    popupSeen: vi.fn(),
    claim: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useVoucher } = await import("./voucher");
const { advanceRuntimeRevision } = await import("@/api/order-api");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function voucher(account: string, grantStatus: "UNCLAIMED" | "AVAILABLE" | "USED" | "EXPIRED" | "REVOKED" = "AVAILABLE") {
  return {
    id: `${account}-voucher`,
    name: `Voucher ${account}`,
    type: "fixed",
    amountUSD: 10,
    minPurchaseUSD: 0,
    applicableSkus: [],
    audience: "all",
    startAt: 0,
    endAt: 0,
    claimSurfaces: ["home"],
    popupEnabled: false,
    stackWithTrial: false,
    stackWithOthers: false,
    splittable: false,
    status: "active",
    definitionDeleted: false,
    grantId: grantStatus === "UNCLAIMED" ? null : `${account}-grant`,
    grantStatus,
    usedOrderNo: null,
    claimable: grantStatus === "UNCLAIMED",
    audienceEligible: true,
    popupCadence: {
      enabled: false, delayMs: 0, cooldownHours: 0, maxPerSession: 1,
      nextEligibleAt: 0, popupEligible: false, source: "nx_growth_voucher",
      sourceEnvironment: "PRODUCTION", runId: "",
    },
  };
}

function snapshot(account: string, grantStatus: "UNCLAIMED" | "AVAILABLE" | "USED" | "EXPIRED" | "REVOKED" = "AVAILABLE") {
  return { vouchers: [voucher(account, grantStatus)], source: "test" };
}

function claimReceipt(voucherId: string) {
  return {
    voucherId,
    grantId: `${voucherId}-grant`,
    status: "AVAILABLE" as const,
    replay: false,
    serverCanonical: true as const,
    source: "nx_growth_voucher",
    sourceEnvironment: "PRODUCTION" as const,
    runId: "" as const,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function createStore() {
  remote.voucherApi.state.mockResolvedValue({ vouchers: [], source: "test" });
  const store = useVoucher();
  await flush();
  remote.voucherApi.state.mockReset();
  remote.voucherApi.popupSeen.mockReset();
  remote.voucherApi.claim.mockReset();
  return store;
}

let activePinia: ReturnType<typeof createPinia>;
beforeEach(() => {
  activePinia = createPinia();
  setActivePinia(activePinia);
  remote.voucherApi.state.mockReset();
  remote.voucherApi.popupSeen.mockReset();
  remote.voucherApi.claim.mockReset();
});

afterEach(() => {
  disposePinia(activePinia);
  advanceRuntimeRevision(null);
});

describe("voucher remote account scope", () => {
  it("removes the previous runtime's selectable vouchers before the replacement catalog arrives", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValueOnce({
      vouchers: [voucher("old-owned"), voucher("old-claimable", "UNCLAIMED")], source: "test",
    });
    store.bindAccount("A");
    await flush();
    expect(store.claimedUnused).toHaveLength(1);
    expect(store.claimableVouchers).toHaveLength(1);
    expect(store.bestVoucherFor("sku", 100)).not.toBeNull();
    const replacement = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(replacement.promise);
    advanceRuntimeRevision("replacement-voucher-run");
    expect(store.remoteStatus).toBe("loading");
    expect(store.catalog).toEqual([]);
    expect(store.claimed).toEqual([]);
    expect(store.claimedUnused).toEqual([]);
    expect(store.claimableVouchers).toEqual([]);
    expect(store.bestVoucherFor("sku", 100)).toBeNull();
    replacement.resolve(snapshot("new-runtime"));
    await flush();
    expect(store.remoteStatus).toBe("ready");
    expect(store.claimedUnused.map((item) => item.id)).toEqual(["new-runtime-voucher"]);
  });

  it("stops runtime-triggered reads when the voucher store is disposed", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue(snapshot("A"));
    store.bindAccount("A");
    await flush();
    store.$dispose();
    const calls = remote.voucherApi.state.mock.calls.length;
    advanceRuntimeRevision("disposed-voucher-run");
    await flush();
    expect(remote.voucherApi.state).toHaveBeenCalledTimes(calls);
  });

  it("keeps an initial remote read unknown and records a recoverable failure without promoting it to a reward empty state", async () => {
    const store = await createStore();
    const pending = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(pending.promise);

    const read = store.refreshRemote();
    expect(store.remoteStatus).toBe("loading");
    // Existing popup arbitration may already have a settled catalog; Rewards
    // uses remoteStatus rather than reinterpreting that signal as fresh data.
    expect(store.catalogReady).toBe(true);

    pending.reject(new Error("voucher unavailable"));
    await expect(read).resolves.toBe(false);
    expect(store.remoteStatus).toBe("error");
    // Popup arbitration still receives the historical "read settled" signal;
    // reward pages use remoteStatus, not this signal, for their empty state.
    expect(store.catalogReady).toBe(true);
  });

  it("keeps an old voucher snapshot visible as stale when the newest read fails", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValueOnce(snapshot("known"));
    await expect(store.refreshRemote()).resolves.toBe(true);
    remote.voucherApi.state.mockRejectedValueOnce(new Error("read unavailable"));

    await expect(store.refreshRemote()).resolves.toBe(false);
    expect(store.remoteStatus).toBe("error");
    expect(store.catalog.map((item) => item.id)).toEqual(["known-voucher"]);
  });

  it("recovers a current voucher read when a popup acknowledgement supersedes it then fails", async () => {
    const store = await createStore();
    const staleRead = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(staleRead.promise).mockResolvedValueOnce(snapshot("recovered"));
    remote.voucherApi.popupSeen.mockRejectedValueOnce(new Error("popup unavailable"));

    const reading = store.refreshRemote();
    await expect(store.markPopupSeen("voucher-1")).resolves.toBe(false);
    await vi.waitFor(() => expect(store.remoteStatus).toBe("ready"));

    expect(remote.voucherApi.state).toHaveBeenCalledTimes(2);
    expect(store.catalog.map((item) => item.id)).toEqual(["recovered-voucher"]);
    staleRead.resolve(snapshot("stale"));
    await expect(reading).resolves.toBe(false);
    expect(store.catalog.map((item) => item.id)).toEqual(["recovered-voucher"]);
  });

  it("recovers a current voucher read when a claim command fails after superseding it", async () => {
    const store = await createStore();
    const staleRead = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(staleRead.promise).mockResolvedValueOnce(snapshot("recovered"));
    remote.voucherApi.claim.mockRejectedValueOnce(new Error("claim unavailable"));

    const reading = store.refreshRemote();
    await expect(store.claimRemote("voucher-1", "home")).resolves.toBe(false);
    await vi.waitFor(() => expect(store.remoteStatus).toBe("ready"));

    expect(remote.voucherApi.state).toHaveBeenCalledTimes(2);
    expect(store.catalog.map((item) => item.id)).toEqual(["recovered-voucher"]);
    staleRead.resolve(snapshot("stale"));
    await expect(reading).resolves.toBe(false);
    expect(store.catalog.map((item) => item.id)).toEqual(["recovered-voucher"]);
  });

  it("drops a late state success after switching accounts", async () => {
    const store = await createStore();
    const stale = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(snapshot("B"));

    store.bindAccount("A");
    store.bindAccount("B");
    await flush();
    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);

    stale.resolve(snapshot("A"));
    await flush();

    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);
  });

  it("drops a late state failure without clearing the next account", async () => {
    const store = await createStore();
    const stale = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(snapshot("B"));

    store.bindAccount("A");
    store.bindAccount("B");
    await flush();
    stale.reject(new Error("account A failed"));
    await flush();

    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);
  });

  it("does not let a stale popup failure restart a read for the next account", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue(snapshot("A"));
    store.bindAccount("A");
    await flush();

    const popup = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.popupSeen.mockReturnValueOnce(popup.promise);
    const pending = store.markPopupSeen("A-voucher");
    remote.voucherApi.state.mockResolvedValue(snapshot("B"));
    store.bindAccount("B");
    await flush();
    const stateCallsAfterRebind = remote.voucherApi.state.mock.calls.length;

    popup.reject(new Error("account A popup failed"));
    await expect(pending).resolves.toBe(false);
    await flush();
    expect(remote.voucherApi.state).toHaveBeenCalledTimes(stateCallsAfterRebind);
    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);
  });

  it("does not read back a stale claim after switching accounts", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue(snapshot("A"));
    store.bindAccount("A");
    await flush();

    const claim = deferred<ReturnType<typeof claimReceipt>>();
    remote.voucherApi.claim.mockReturnValue(claim.promise);
    remote.voucherApi.state.mockResolvedValue(snapshot("B"));
    const pending = store.claimRemote("A-voucher", "home");

    store.bindAccount("B");
    await flush();
    const stateCallsAfterRebind = remote.voucherApi.state.mock.calls.length;
    claim.resolve(claimReceipt("A-voucher"));

    await expect(pending).resolves.toBe(false);
    await flush();
    expect(remote.voucherApi.state).toHaveBeenCalledTimes(stateCallsAfterRebind);
    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);
  });

  it("drops a stale claim failure without clearing the next account", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue(snapshot("A"));
    store.bindAccount("A");
    await flush();

    const claim = deferred<ReturnType<typeof claimReceipt>>();
    remote.voucherApi.claim.mockReturnValue(claim.promise);
    remote.voucherApi.state.mockResolvedValue(snapshot("B"));
    const pending = store.claimRemote("A-voucher", "home");

    store.bindAccount("B");
    await flush();
    const stateCallsAfterRebind = remote.voucherApi.state.mock.calls.length;
    claim.reject(new Error("account A failed"));

    await expect(pending).resolves.toBe(false);
    await flush();
    expect(remote.voucherApi.state).toHaveBeenCalledTimes(stateCallsAfterRebind);
    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);
  });

  it("keeps the newest refresh for the same account", async () => {
    const store = await createStore();
    const older = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(older.promise).mockResolvedValue(snapshot("new"));
    const first = store.refreshRemote();
    const second = store.refreshRemote();
    await second;
    older.resolve(snapshot("old"));
    await first;
    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher new"]);
  });

  it("drops a catalog when the sandbox RunID changes", async () => {
    advanceRuntimeRevision("voucher-run-a");
    const store = await createStore();
    const stale = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(stale.promise);
    store.bindAccount("A");

    remote.voucherApi.state.mockReset();
    remote.voucherApi.state.mockResolvedValue({ vouchers: [], source: "test" });
    advanceRuntimeRevision("voucher-run-b");
    await vi.waitFor(() => expect(store.remoteStatus).toBe("ready"));
    expect(store.catalog).toEqual([]);

    stale.resolve(snapshot("run-a"));
    await flush();
    expect(store.catalog).toEqual([]);
  });

  it("never exposes expired or revoked grants as redeemable checkout vouchers", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue({
      vouchers: [voucher("expired", "EXPIRED"), voucher("revoked", "REVOKED")],
      source: "test",
    });
    await store.refreshRemote();

    expect(store.claimedUnused).toEqual([]);
    expect(store.bestVoucherFor("any-sku", 100)).toBeNull();
  });

  it("passes the visible entry surface to the canonical claim command", async () => {
    const store = await createStore();
    remote.voucherApi.claim.mockResolvedValue(claimReceipt("store-voucher"));
    remote.voucherApi.state.mockResolvedValue({ vouchers: [], source: "test" });

    await store.claimRemote("store-voucher", "store");

    expect(remote.voucherApi.claim).toHaveBeenCalledWith(
      "store-voucher",
      "store",
      "h7-voucher-claim:store-voucher",
    );
  });

  it("keeps the typed canonical claim receipt when its follow-up GET fails", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValueOnce(snapshot("receipt", "UNCLAIMED"));
    await expect(store.refreshRemote()).resolves.toBe(true);
    remote.voucherApi.claim.mockResolvedValue(claimReceipt("receipt-voucher"));
    remote.voucherApi.state.mockRejectedValueOnce(new Error("readback unavailable"));

    await expect(store.claimRemote("receipt-voucher", "me")).resolves.toBe(true);

    expect(store.claimed).toMatchObject([{ id: "receipt-voucher", usedAt: null }]);
    expect(store.catalog).toMatchObject([{ id: "receipt-voucher", grantId: "receipt-voucher-grant", grantStatus: "AVAILABLE", claimable: false }]);
    expect(store.claimedUnused.map((item) => item.id)).toEqual(["receipt-voucher"]);
  });
});
