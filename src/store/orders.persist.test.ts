/**
 * orders.createOrder —— 建单落盘失败不许留下一条只活在内存里的「已付」订单(审计 R4 P1):
 * 调用方此前已扣款 / 下架旧机,必须拿到 null 才能按原路退回。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/api/runtime", () => ({
  fundsServerEnabled: false, remoteApiEnabled: false, developmentFundsEnabled: false,
  orderApi: {}, accountApi: {}, walletApi: {},
}));

const memory = new Map<string, unknown>();
let storageBroken = false;
(globalThis as unknown as { uni: unknown }).uni = {
  getStorageSync: (k: string) => (memory.has(k) ? JSON.parse(JSON.stringify(memory.get(k))) : ""),
  setStorageSync: (k: string, v: unknown) => {
    if (storageBroken) throw new Error("QuotaExceededError");
    memory.set(k, JSON.parse(JSON.stringify(v)));
  },
  removeStorageSync: (k: string) => { memory.delete(k); },
  getStorageInfoSync: () => ({ keys: [...memory.keys()] }),
};

const { useOrders } = await import("./orders");

const INPUT = { productId: "stellarbox-s1" as const, productName: "StellarBox S1", unitPrice: 649, paymentMethod: "usdt-trc20" as const };

describe("useOrders.createOrder persistence contract", () => {
  beforeEach(() => { memory.clear(); storageBroken = false; setActivePinia(createPinia()); });

  it("returns the order and it survives a fresh hydrate when storage works", () => {
    const store = useOrders();
    store.bindAccount("acct-a");
    const ord = store.createOrder(INPUT);
    expect(ord).not.toBeNull();
    expect(store.orders.map((o) => o.id)).toEqual([ord!.id]);
    setActivePinia(createPinia());
    const again = useOrders();
    again.bindAccount("acct-a");
    expect(again.orders.map((o) => o.id)).toEqual([ord!.id]);
  });

  it("createOrders is one write: a batch is all-or-nothing (no partial batch on disk)", () => {
    const store = useOrders();
    store.bindAccount("acct-a");
    const inputs = [INPUT, { ...INPUT, productId: "stellarbox-pro" as const, productName: "Pro", unitPrice: 1199 }, INPUT];
    storageBroken = true;
    expect(store.createOrders(inputs)).toBeNull();
    expect(store.orders).toHaveLength(0);
    storageBroken = false;
    const batch = store.createOrders(inputs);
    expect(batch).toHaveLength(3);
    expect(store.orders).toHaveLength(3);
    setActivePinia(createPinia());
    const again = useOrders();
    again.bindAccount("acct-a");
    expect(again.orders.map((o) => o.id).sort()).toEqual(batch!.map((o) => o.id).sort());
  });
  it("returns null and leaves NO memory-only order when the write fails", () => {
    const store = useOrders();
    store.bindAccount("acct-a");
    storageBroken = true;
    const ord = store.createOrder(INPUT);
    expect(ord).toBeNull();
    expect(store.orders).toHaveLength(0);
    storageBroken = false;
    setActivePinia(createPinia());
    const again = useOrders();
    again.bindAccount("acct-a");
    expect(again.orders).toHaveLength(0);
  });

  it("two tabs never overwrite each other's orders (CAS row): a stale tab's create / advance keeps the other tab's paid order on disk", () => {
    const tabA = useOrders();
    tabA.bindAccount("acct-a");
    setActivePinia(createPinia());
    const tabB = useOrders();
    tabB.bindAccount("acct-a");                    // both hydrated the same (empty) row; from now on their memories drift
    const o1 = tabA.createOrder(INPUT)!;             // tab A pays for O1
    const o2 = tabB.createOrder({ ...INPUT, productName: "second" })!; // tab B (stale memory: []) pays for O2
    setActivePinia(createPinia());
    const disk = useOrders();
    disk.bindAccount("acct-a");
    expect(disk.orders.map((o) => o.id).sort()).toEqual([o1.id, o2.id].sort()); // O1 was NOT erased by tab B's write
    // tab A advances its own order with a stale in-memory list that lacks O2 → O2 must survive
    tabA.advanceOrder(o1.id);
    setActivePinia(createPinia());
    const disk2 = useOrders();
    disk2.bindAccount("acct-a");
    expect(disk2.orders.some((o) => o.id === o2.id)).toBe(true);
    expect(disk2.orders.find((o) => o.id === o1.id)!.status).not.toBe("paid");
  });
});
