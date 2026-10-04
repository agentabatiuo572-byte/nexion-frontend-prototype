import { beforeEach, describe, expect, it, vi } from "vitest";
import { rememberCheckoutOrder, recoverCheckoutOrder, forgetCheckoutOrder } from "./checkout-order-recovery";

let disk: Record<string, unknown>;
beforeEach(() => {
  disk = {};
  vi.stubGlobal("uni", { getStorageSync: (k: string) => disk[k], setStorageSync: (k: string, v: unknown) => { disk[k] = v; } });
});

describe("checkout committed-order recovery", () => {
  const pointer = { productNo: "sku-a", orderNo: "ORDER-1", intent: "sku-a||wallet|ordinary", commandKey: "h7-order:one" };
  const paid = { orderNo: "ORDER-1", productNo: "sku-a", quantity: 1, canonicalStatus: "activated" };
  function deps(order: unknown = paid) {
    return { list: vi.fn().mockResolvedValue({ orders: [order], nextCursor: null }),
      isCurrent: () => true, navigate: vi.fn().mockResolvedValue(true) };
  }
  it("recovers an already-paid original order after a lost response and reload without another create or pay", async () => {
    rememberCheckoutOrder("a", pointer);
    const h = deps();
    expect(await recoverCheckoutOrder("a", "sku-a", h)).toBe(true);
    expect(h.navigate).toHaveBeenCalledWith("/pages/store/order-detail?id=ORDER-1");
    expect(await recoverCheckoutOrder("a", "sku-a", h)).toBe(false);
  });
  it("leaves pending and unknown results recoverable and does not announce success", async () => {
    rememberCheckoutOrder("a", pointer);
    const h = deps({ ...paid, canonicalStatus: "placed" });
    expect(await recoverCheckoutOrder("a", "sku-a", h)).toBe(true);
    h.list.mockRejectedValue(new Error("offline"));
    expect(await recoverCheckoutOrder("a", "sku-a", h)).toBe(true);
    expect(h.navigate).toHaveBeenCalledTimes(2);
  });
  it("does not recover a different account, product, or late account response", async () => {
    rememberCheckoutOrder("a", pointer);
    const h = deps();
    expect(await recoverCheckoutOrder("b", "sku-a", h)).toBe(false);
    expect(await recoverCheckoutOrder("a", "sku-b", h)).toBe(false);
    h.isCurrent = () => false;
    expect(await recoverCheckoutOrder("a", "sku-a", h)).toBe(true);
    expect(h.navigate).not.toHaveBeenCalled();
  });
  it("finds an older order beyond the first list page and retains recovery after navigation failure", async () => {
    rememberCheckoutOrder("a", pointer);
    const h = deps();
    h.list.mockResolvedValueOnce({ orders: [], nextCursor: "older" });
    h.navigate.mockResolvedValueOnce(false);
    expect(await recoverCheckoutOrder("a", "sku-a", h)).toBe(true);
    expect(h.list).toHaveBeenNthCalledWith(2, "older", 100);
    expect(await recoverCheckoutOrder("a", "sku-a", h)).toBe(true);
  });
  it("fails before payment if its recovery pointer cannot be persisted", () => {
    vi.stubGlobal("uni", { getStorageSync: () => disk, setStorageSync: () => { throw new Error("disk full"); } });
    expect(() => rememberCheckoutOrder("a", pointer)).toThrow("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
  });
  it("does not delete another newer order when retiring an old receipt", () => {
    rememberCheckoutOrder("a", pointer);
    forgetCheckoutOrder("a", "sku-a", "OLD");
    return expect(recoverCheckoutOrder("a", "sku-a", deps())).resolves.toBe(true);
  });
});
