import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createOrderApi } from "./order-api";
import checkoutSource from "../pages/store/checkout.vue?raw";

describe("NexGrid wallet commerce payment", () => {
  it("posts the order pay command and accepts only an activated wallet receipt", async () => {
    const request = vi.fn().mockResolvedValue({
      orderNo: "ORD-1",
      paymentNo: "PAY-WALLET-1",
      paymentStatus: "PAID",
      orderStatus: "COMPLETED",
      activationStatus: "ACTIVATED",
      canonicalStatus: "activated",
      amountUsdt: 10,
      paymentMethod: "NEXGRID_WALLET",
      walletBalanceAfterUsdt: 15,
      idempotent: false,
      serverCanonical: true,
      source: "server",
      sourceEnvironment: "PRODUCTION",
      runId: "",
    });
    const api = createOrderApi({ request } as unknown as ApiClient, "prod");

    await expect(api.pay("ORD-1", "wallet-pay-key"))
      .resolves.toMatchObject({
        orderNo: "ORD-1",
        paymentNo: "PAY-WALLET-1",
        paymentMethod: "WALLET",
        walletBalanceAfterUsdt: 15,
        canonicalStatus: "activated",
      });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/api/orders/ORD-1/pay",
      idempotencyKey: "wallet-pay-key",
    }));
  });

  it("rejects a receipt that is not synchronously paid and activated", async () => {
    const api = createOrderApi({ request: vi.fn().mockResolvedValue({
      orderNo: "ORD-1", paymentNo: "PAY-WALLET-1",
      paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT",
      activationStatus: "WAITING_PAYMENT", canonicalStatus: "placed",
      amountUsdt: 10, paymentMethod: "NEXGRID_WALLET",
      walletBalanceAfterUsdt: 15, idempotent: false,
      serverCanonical: true, source: "server", sourceEnvironment: "PRODUCTION", runId: "",
    }) } as unknown as ApiClient, "prod");

    await expect(api.pay("ORD-1", "wallet-pay-key"))
      .rejects.toMatchObject({ kind: "protocol", message: "ORDER_RESPONSE_INVALID" });
  });

  it("accepts a zero-payable voucher receipt without reading or rewriting the wallet", async () => {
    const api = createOrderApi({ request: vi.fn().mockResolvedValue({
      orderNo: "ORD-FREE-1", paymentNo: "PAY-VOUCHER-1",
      paymentStatus: "PAID", orderStatus: "COMPLETED",
      activationStatus: "ACTIVATED", canonicalStatus: "activated",
      amountUsdt: 0, paymentMethod: "VOUCHER", walletBalanceAfterUsdt: null,
      idempotent: false, serverCanonical: true, source: "server",
      sourceEnvironment: "PRODUCTION", runId: "",
    }) } as unknown as ApiClient, "prod");

    await expect(api.pay("ORD-FREE-1", "voucher-pay-key")).resolves.toMatchObject({
      amountUsdt: 0,
      paymentMethod: "VOUCHER",
      walletBalanceAfterUsdt: null,
    });
  });

  it("keeps checkout on wallet pay and contains no HDPay commerce-page launcher", () => {
    expect(checkoutSource).toContain("orderApi.pay(");
    expect(checkoutSource).toContain("ORDER_WALLET_INSUFFICIENT");
    expect(checkoutSource).toContain("/pages/me/wallet-topup");
    expect(checkoutSource).not.toContain("orderApi.createPaymentSession(");
    expect(checkoutSource).not.toContain("openHostedPaymentPage(");
  });
});
