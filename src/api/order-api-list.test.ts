import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createOrderApi, advanceRuntimeRevision } from "./order-api";

function order() {
  return {
    orderNo: "ORD-1", productId: 1, productNo: "stellarrack-p1", productName: "Rack",
    quantity: 1, subtotalUsdt: 100, unitPriceUsdt: 100, discountUsdt: 0, amountUsdt: 100,
    paymentMethod: "USDT", paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT",
    activationStatus: "WAITING_PAYMENT", canonicalStatus: "placed", orderType: "SINGLE",
    placedAt: 1, paidAt: null, activatedAt: null, dataCenter: "Frankfurt DC",
    tradeinNo: null, sourceDeviceId: null, targetDeviceId: null,
    targetDeviceInstanceNo: null, itemCount: null, expiresAt: 1_800_001,
    refundedAt: null, refundAmountUsdt: null, refundChannel: null, refundBillNo: null,
  };
}

function api(payload: unknown, mode: "prod" | "dev") {
  return createOrderApi({ request: vi.fn().mockResolvedValue(payload) } as unknown as ApiClient, mode);
}

afterEach(() => advanceRuntimeRevision(null));

describe("order list provenance", () => {
  it("requests a bounded cursor page and exposes the next cursor", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "server", sourceEnvironment: "PRODUCTION", runId: null,
      serverCanonical: true, nextCursor: "ORD-1", orders: [order()],
    });

    await expect(createOrderApi({ request } as unknown as ApiClient, "prod").list("ORD-2", 50))
      .resolves.toMatchObject({ nextCursor: "ORD-1" });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      path: "/api/orders?beforeOrderNo=ORD-2&pageSize=50",
    }));
  });

  it("remote mode accepts only server production data", async () => {
    await expect(api({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true, orders: [order()] }, "prod").list())
      .resolves.toMatchObject({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true });
  });

  it("remote mode rejects sandbox/mock data", async () => {
    advanceRuntimeRevision("run-20260817");
    await expect(api({ source: "mock", sourceEnvironment: "SANDBOX", runId: "run-20260817", serverCanonical: true, orders: [order()] }, "prod").list())
      .rejects.toMatchObject({ message: "ORDER_RESPONSE_INVALID" });
  });

  it("development mode accepts the same Java production-shaped order authority", async () => {
    await expect(api({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true, orders: [order()] }, "dev").list())
      .resolves.toMatchObject({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true });
  });

  it("keeps bundle SKU rows structured instead of trusting an aggregate display string", async () => {
    const bundle = {
      ...order(), orderNo: "BND-1", orderType: "BUNDLE", quantity: 2,
      lineItems: [
        { sku: "S1", name: "NexGridBox S1", quantity: 1, unitPriceUsdt: 60, lineAmountUsdt: 60 },
        { sku: "PRO", name: "NexGridBox Pro", quantity: 1, unitPriceUsdt: 40, lineAmountUsdt: 40 },
      ],
    };
    await expect(api({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true, orders: [bundle] }, "prod").list())
      .resolves.toMatchObject({ orders: [{ lineItems: bundle.lineItems }] });
    const missingLines = { ...bundle };
    delete (missingLines as { lineItems?: unknown }).lineItems;
    await expect(api({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true, orders: [missingLines] }, "prod").list())
      .rejects.toMatchObject({ message: "ORDER_RESPONSE_INVALID" });
  });

  it("development mode rejects sandbox data even when its RunID is current", async () => {
    advanceRuntimeRevision("run-20260817");
    await expect(api({ source: "mock", sourceEnvironment: "SANDBOX", runId: "run-20260817", serverCanonical: true, orders: [order()] }, "dev").list())
      .rejects.toMatchObject({ message: "ORDER_RESPONSE_INVALID" });
  });

  it("rejects an order envelope without the server canonical marker", async () => {
    await expect(api({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, orders: [order()] }, "prod").list())
      .rejects.toMatchObject({ message: "ORDER_RESPONSE_INVALID" });
    await expect(api({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: false, orders: [order()] }, "prod").list())
      .rejects.toMatchObject({ message: "ORDER_RESPONSE_INVALID" });
  });

  it("requires an authoritative expiry for pending orders", async () => {
    const missingExpiry = { ...order() };
    delete (missingExpiry as { expiresAt?: unknown }).expiresAt;
    await expect(api({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true, orders: [missingExpiry] }, "prod").list())
      .rejects.toMatchObject({ message: "ORDER_RESPONSE_INVALID" });
  });

  it("accepts complete or legacy-absent refund facts but rejects partial facts", async () => {
    const refunded = {
      ...order(), paymentStatus: "REFUNDED", orderStatus: "REFUNDED", activationStatus: "REFUNDED",
      canonicalStatus: "refunded", expiresAt: null, refundedAt: 2_000,
      refundAmountUsdt: 100, refundChannel: "WALLET", refundBillNo: "E4-BILL-ORD-1",
    };
    await expect(api({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true, orders: [refunded] }, "prod").list())
      .resolves.toMatchObject({ orders: [{ refundedAt: 2_000, refundAmountUsdt: 100, refundChannel: "WALLET" }] });

    await expect(api({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true, orders: [{
      ...refunded, refundedAt: null, refundAmountUsdt: null, refundChannel: null, refundBillNo: null,
    }] }, "prod").list()).resolves.toMatchObject({ orders: [{ canonicalStatus: "refunded", refundedAt: null }] });

    await expect(api({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true, orders: [{ ...refunded, refundedAt: null }] }, "prod").list())
      .rejects.toMatchObject({ message: "ORDER_RESPONSE_INVALID" });
  });
});
