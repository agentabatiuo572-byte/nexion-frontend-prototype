import { describe, expect, it } from "vitest";
import { CheckoutRouteFence } from "./checkout-route-fence";

describe("checkout route fence", () => {
  it("rejects A's delayed eligibility result after an account generation changes to B", () => {
    const fence = new CheckoutRouteFence();
    const requestA = fence.begin({ accountKey: "a", accountEpoch: 1, productNo: "sku-a" });
    fence.begin({ accountKey: "b", accountEpoch: 2, productNo: "sku-a" });

    expect(fence.isCurrent(requestA, { accountKey: "b", accountEpoch: 2, productNo: "sku-a" })).toBe(false);
  });

  it("rejects a response for the previous SKU in the same account", () => {
    const fence = new CheckoutRouteFence();
    const requestA = fence.begin({ accountKey: "a", accountEpoch: 1, productNo: "sku-a" });
    fence.begin({ accountKey: "a", accountEpoch: 1, productNo: "sku-b" });

    expect(fence.isCurrent(requestA, { accountKey: "a", accountEpoch: 1, productNo: "sku-b" })).toBe(false);
  });

  it("rejects a delayed result after leaving the page and allows the next visible re-entry", () => {
    const fence = new CheckoutRouteFence();
    const request = fence.begin({ accountKey: "a", accountEpoch: 1, productNo: "sku-a" });
    fence.invalidate();

    expect(fence.isCurrent(request, { accountKey: "a", accountEpoch: 1, productNo: "sku-a" })).toBe(false);
    const reentered = fence.capture({ accountKey: "a", accountEpoch: 1, productNo: "sku-a" });
    expect(fence.isCurrent(reentered, { accountKey: "a", accountEpoch: 1, productNo: "sku-a" })).toBe(true);
  });

  it("keeps two recovery completions distinct across account and SKU routes", () => {
    const fence = new CheckoutRouteFence();
    const first = fence.begin({ accountKey: "a", accountEpoch: 1, productNo: "sku-a" });
    const second = fence.begin({ accountKey: "b", accountEpoch: 2, productNo: "sku-b" });

    expect(fence.isCurrent(first, { accountKey: "b", accountEpoch: 2, productNo: "sku-b" })).toBe(false);
    expect(fence.isCurrent(second, { accountKey: "b", accountEpoch: 2, productNo: "sku-b" })).toBe(true);
  });
});
