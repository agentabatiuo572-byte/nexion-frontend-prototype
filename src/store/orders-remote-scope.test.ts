import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { CanonicalOrder, CanonicalOrderList } from "@/api/order-api";
import { advanceRuntimeRevision } from "@/api/order-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  productCatalogApi: { catalog: vi.fn() },
  orderApi: {
    list: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useOrders } = await import("./orders");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function canonical(account: string): CanonicalOrder {
  return {
    orderNo: `ORD-${account}`,
    productId: 1,
    productNo: "stellarrack-p1",
    productName: `Product ${account}`,
    quantity: 1,
    subtotalUsdt: 100,
    unitPriceUsdt: 100,
    discountUsdt: 0,
    amountUsdt: 100,
    paymentMethod: "USDT",
    paymentStatus: "PENDING",
    orderStatus: "PENDING_PAYMENT",
    activationStatus: "WAITING_PAYMENT",
    canonicalStatus: "placed",
    orderType: "SINGLE",
    placedAt: 1,
    expiresAt: 2,
    paidAt: null,
    activatedAt: null,
    refundedAt: null,
    refundAmountUsdt: null,
    refundChannel: null,
    refundBillNo: null,
    dataCenter: "Frankfurt DC",
    tradeinNo: null,
    sourceDeviceId: null,
    targetDeviceId: null,
    targetDeviceInstanceNo: null,
    itemCount: null,
  };
}

function list(account: string): CanonicalOrderList {
  return {
    source: "server",
    sourceEnvironment: "PRODUCTION",
    runId: null,
    nextCursor: null,
    orders: [canonical(account)],
  };
}

function cancelledList(account: string): CanonicalOrderList {
  return {
    ...list(account),
    orders: [{
      ...canonical(account),
      paymentStatus: "CANCELLED",
      orderStatus: "CANCELLED",
      activationStatus: "CANCELLED",
      canonicalStatus: "cancelled",
    }],
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  advanceRuntimeRevision(null);
  remote.orderApi.list.mockReset();
  remote.orderApi.cancel.mockReset();
});

describe("orders remote account and commerce run scope", () => {
  it("drops a late list success after switching accounts", async () => {
    const listA = deferred<CanonicalOrderList>();
    const listB = deferred<CanonicalOrderList>();
    remote.orderApi.list.mockReturnValueOnce(listA.promise).mockReturnValueOnce(listB.promise);
    const store = useOrders();

    store.bindAccount("A");
    const pendingA = store.refreshRemote();
    store.bindAccount("B");
    const pendingB = store.refreshRemote();
    listB.resolve(list("B"));
    await pendingB;
    listA.resolve(list("A"));
    await pendingA;

    expect(store.orders[0]?.id).toBe("ORD-B");
    expect(store.orders[0]?.productName).toBe("Product B");
  });

  it("drops a late list failure after switching accounts without throwing", async () => {
    const listA = deferred<CanonicalOrderList>();
    const listB = deferred<CanonicalOrderList>();
    remote.orderApi.list.mockReturnValueOnce(listA.promise).mockReturnValueOnce(listB.promise);
    const store = useOrders();

    store.bindAccount("A");
    const pendingA = store.refreshRemote();
    store.bindAccount("B");
    const pendingB = store.refreshRemote();
    listB.resolve(list("B"));
    await pendingB;
    listA.reject(new Error("old account failed"));
    await expect(pendingA).resolves.toBeUndefined();

    expect(store.orders[0]?.id).toBe("ORD-B");
  });

  it("drops a late same-account list success after a newer refresh", async () => {
    const first = deferred<CanonicalOrderList>();
    const second = deferred<CanonicalOrderList>();
    remote.orderApi.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = useOrders();
    store.bindAccount("A");

    const firstRefresh = store.refreshRemote();
    const secondRefresh = store.refreshRemote();
    second.resolve(list("new"));
    await secondRefresh;
    first.resolve(list("old"));
    await firstRefresh;

    expect(store.orders[0]?.id).toBe("ORD-new");
  });

  it("loads the next server page without replacing the first page", async () => {
    remote.orderApi.list
      .mockResolvedValueOnce({ ...list("new"), nextCursor: "ORD-new" })
      .mockResolvedValueOnce(list("old"));
    const store = useOrders();
    store.bindAccount("A");

    await store.refreshRemote();
    await store.loadMoreRemote();

    expect(remote.orderApi.list).toHaveBeenNthCalledWith(1, null, 50);
    expect(remote.orderApi.list).toHaveBeenNthCalledWith(2, "ORD-new", 50);
    expect(store.orders.map((order) => order.id)).toEqual(["ORD-new", "ORD-old"]);
    expect(store.nextCursor).toBeNull();
  });

  it("clears a superseded load-more spinner when a newer refresh wins", async () => {
    const latePage = deferred<CanonicalOrderList>();
    remote.orderApi.list
      .mockResolvedValueOnce({ ...list("first"), nextCursor: "ORD-first" })
      .mockReturnValueOnce(latePage.promise)
      .mockResolvedValueOnce(list("fresh"));
    const store = useOrders();
    store.bindAccount("A");

    await store.refreshRemote();
    const pendingMore = store.loadMoreRemote();
    expect(store.loadingMore).toBe(true);
    await store.refreshRemote();
    expect(store.loadingMore).toBe(false);
    latePage.resolve(list("late"));
    await pendingMore;

    expect(store.loadingMore).toBe(false);
    expect(store.orders.map((order) => order.id)).toEqual(["ORD-fresh"]);
  });

  it("fails closed when the server repeats the requested order cursor", async () => {
    remote.orderApi.list
      .mockResolvedValueOnce({ ...list("new"), nextCursor: "ORD-new" })
      .mockResolvedValueOnce({ ...list("old"), nextCursor: "ORD-new" });
    const store = useOrders();
    store.bindAccount("A");

    await store.refreshRemote();
    await expect(store.loadMoreRemote()).rejects.toThrow("ORDER_LIST_CURSOR_NOT_ADVANCING");

    expect(store.loadingMore).toBe(false);
    expect(store.nextCursor).toBeNull();
    expect(store.orders.map((order) => order.id)).toEqual(["ORD-new"]);
  });

  it("walks server pages when a deep-linked order is not on the first page", async () => {
    remote.orderApi.list
      .mockResolvedValueOnce({ ...list("new"), nextCursor: "ORD-new" })
      .mockResolvedValueOnce(list("target"));
    const store = useOrders();
    store.bindAccount("A");

    const found = await store.ensureRemoteOrder("ORD-target");

    expect(found?.id).toBe("ORD-target");
    expect(remote.orderApi.list).toHaveBeenNthCalledWith(2, "ORD-new", 50);
  });

  it("accepts the canonical same-account readback after cancellation", async () => {
    remote.orderApi.cancel.mockResolvedValue({});
    remote.orderApi.list.mockResolvedValue(cancelledList("A"));
    const store = useOrders();
    store.bindAccount("A");

    await expect(store.cancelOrderRemote("ORD-A")).resolves.toBe(true);
    expect(store.orders[0]?.status).toBe("cancelled");
  });

  it("does not read back or mutate after a late cancel success from another account", async () => {
    const cancelA = deferred<unknown>();
    remote.orderApi.cancel.mockReturnValue(cancelA.promise);
    const store = useOrders();
    store.bindAccount("A");
    const pending = store.cancelOrderRemote("ORD-A");

    store.bindAccount("B");
    cancelA.resolve({});
    await expect(pending).resolves.toBe(false);

    expect(remote.orderApi.list).not.toHaveBeenCalled();
    expect(store.orders).toEqual([]);
  });

  it("does not read back or mutate after a late cancel failure from another account", async () => {
    const cancelA = deferred<unknown>();
    remote.orderApi.cancel.mockReturnValue(cancelA.promise);
    const store = useOrders();
    store.bindAccount("A");
    const pending = store.cancelOrderRemote("ORD-A");

    store.bindAccount("B");
    cancelA.reject(new Error("old account failed"));
    await expect(pending).resolves.toBe(false);

    expect(remote.orderApi.list).not.toHaveBeenCalled();
    expect(store.orders).toEqual([]);
  });

  it("drops a cancel response after the sandbox catalog run changes", async () => {
    advanceRuntimeRevision("run-20260816");
    const cancel = deferred<unknown>();
    remote.orderApi.cancel.mockReturnValue(cancel.promise);
    const store = useOrders();
    store.bindAccount("A");
    const pending = store.cancelOrderRemote("ORD-A");

    advanceRuntimeRevision("run-20260817");
    cancel.resolve({});
    await expect(pending).resolves.toBe(false);

    expect(remote.orderApi.list).not.toHaveBeenCalled();
  });
});
