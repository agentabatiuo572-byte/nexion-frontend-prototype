import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { CanonicalOrder, CanonicalOrderList } from "@/api/order-api";
import { setCurrentCommerceSandboxRun } from "@/api/order-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  productCatalogApi: { catalog: vi.fn() },
  orderApi: { list: vi.fn(), cancel: vi.fn() },
}));

vi.mock("@/api/runtime", () => remote);

const { useOrders } = await import("./orders");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function list(label: string): CanonicalOrderList {
  const order: CanonicalOrder = {
    orderNo: `ORD-${label}`, productId: 1, productNo: "stellarbox-pro", productName: label,
    quantity: 1, unitPriceUsdt: 100, discountUsdt: 0, amountUsdt: 100,
    paymentMethod: "USDT", paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT",
    activationStatus: "WAITING_PAYMENT", canonicalStatus: "placed", orderType: "SINGLE",
    placedAt: 1, paidAt: null, activatedAt: null, dataCenter: null, tradeinNo: null,
    sourceDeviceId: null, targetDeviceId: null, targetDeviceInstanceNo: null, itemCount: null,
  };
  return { source: "server", sourceEnvironment: "PRODUCTION", runId: null, orders: [order] };
}

beforeEach(() => {
  setActivePinia(createPinia());
  setCurrentCommerceSandboxRun(null);
  remote.orderApi.list.mockReset();
  remote.orderApi.cancel.mockReset();
});

describe("orders consume only the current request scope", () => {
  it("drops an older same-account refresh after a newer response wins", async () => {
    const oldRequest = deferred<CanonicalOrderList>();
    const newRequest = deferred<CanonicalOrderList>();
    remote.orderApi.list.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const store = useOrders();
    store.bindAccount("A");

    const oldPending = store.refreshRemote();
    const newPending = store.refreshRemote();
    newRequest.resolve(list("new"));
    await newPending;
    oldRequest.resolve(list("old"));
    await oldPending;

    expect(store.orders[0]?.id).toBe("ORD-new");
  });

  it("drops a late response after the account changes", async () => {
    const stale = deferred<CanonicalOrderList>();
    remote.orderApi.list.mockReturnValue(stale.promise);
    const store = useOrders();
    store.bindAccount("A");
    const pending = store.refreshRemote();
    store.bindAccount("B");
    stale.resolve(list("A"));
    await pending;
    expect(store.orders).toEqual([]);
  });

  it("drops a late response after the commerce RunID changes", async () => {
    setCurrentCommerceSandboxRun("run-20260816");
    const stale = deferred<CanonicalOrderList>();
    remote.orderApi.list.mockReturnValue(stale.promise);
    const store = useOrders();
    store.bindAccount("A");
    const pending = store.refreshRemote();
    setCurrentCommerceSandboxRun("run-20260817");
    stale.resolve({ ...list("old"), source: "mock", sourceEnvironment: "SANDBOX", runId: "run-20260816" });
    await pending;
    expect(store.orders).toEqual([]);
  });

  it("does not read back after a cancel response from an old account", async () => {
    const stale = deferred<unknown>();
    remote.orderApi.cancel.mockReturnValue(stale.promise);
    const store = useOrders();
    store.bindAccount("A");
    const pending = store.cancelOrderRemote("ORD-A");
    store.bindAccount("B");
    stale.resolve({});
    await expect(pending).resolves.toBe(false);
    expect(remote.orderApi.list).not.toHaveBeenCalled();
  });
});
