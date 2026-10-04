import { describe, expect, it } from "vitest";
import { isCanonicalPaidOrder } from "./order-readback";
import type { CanonicalOrder } from "./order-api";

function order(overrides: Partial<CanonicalOrder> = {}): CanonicalOrder {
  return {
    orderNo: "ORD-1",
    productId: 1,
    productNo: "stellarbox-s1",
    productName: "StellarBox S1",
    quantity: 1,
    subtotalUsdt: 100,
    unitPriceUsdt: 100,
    discountUsdt: 0,
    amountUsdt: 100,
    paymentMethod: "sandbox-wallet",
    paymentStatus: "PAID",
    orderStatus: "PAID",
    activationStatus: "WAITING_PROVISIONING",
    canonicalStatus: "paid",
    orderType: "DIRECT",
    placedAt: 1,
    expiresAt: null,
    paidAt: 2,
    activatedAt: null,
    refundedAt: null,
    refundAmountUsdt: null,
    refundChannel: null,
    refundBillNo: null,
    dataCenter: null,
    tradeinNo: null,
    sourceDeviceId: null,
    targetDeviceId: null,
    targetDeviceInstanceNo: null,
    itemCount: 2,
    ...overrides,
  } as CanonicalOrder;
}

describe("canonical payment readback", () => {
  it("accepts the same paid bundle and item count", () => {
    expect(isCanonicalPaidOrder(order(), "ORD-1", 2)).toBe(true);
  });

  it("accepts a development payment that completed and activated immediately", () => {
    expect(isCanonicalPaidOrder(order({
      canonicalStatus: "activated", orderStatus: "COMPLETED", activationStatus: "ACTIVATED",
    }), "ORD-1", 2)).toBe(true);
  });

  it("rejects a pending or mismatched order", () => {
    expect(isCanonicalPaidOrder(order({ canonicalStatus: "placed", paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT" }), "ORD-1", 2)).toBe(false);
    expect(isCanonicalPaidOrder(order(), "ORD-2", 2)).toBe(false);
    expect(isCanonicalPaidOrder(order({ itemCount: 1 }), "ORD-1", 2)).toBe(false);
  });

  it("allows single-order readback without a bundle count", () => {
    expect(isCanonicalPaidOrder(order({ itemCount: null }), "ORD-1")).toBe(true);
  });
});
