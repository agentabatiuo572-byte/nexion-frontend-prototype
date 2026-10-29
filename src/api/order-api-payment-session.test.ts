import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createOrderApi } from "./order-api";
import checkoutSource from "../pages/store/checkout.vue?raw";

describe("UVEL wallet commerce payment", () => {
  it("reaches pay for the same created order when history includes previously deactivated purchases", async () => {
    const pending = { orderNo: "ORD-NEW", productId: 10, productNo: "cloud-share", productName: "Cloud Share",
      quantity: 1, itemCount: 1, subtotalUsdt: 19.9, unitPriceUsdt: 19.9, discountUsdt: 1, amountUsdt: 18.9,
      paymentMethod: "PENDING", paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT",
      activationStatus: "WAITING_PAYMENT", canonicalStatus: "placed", orderType: "SINGLE",
      placedAt: 1, expiresAt: 1_800_001, paidAt: null, activatedAt: null, dataCenter: null,
      tradeinNo: null, sourceDeviceId: null, targetDeviceId: null, targetDeviceInstanceNo: null };
    const historical = { ...pending, paymentMethod: "UVEL_WALLET", paymentStatus: "PAID", orderStatus: "COMPLETED",
      activationStatus: "ACTIVATED", canonicalStatus: "activated", paidAt: 2_000, activatedAt: null, expiresAt: null };
    const request = vi.fn()
      .mockResolvedValueOnce({ ...pending, idSource: "server", voucherId: "VOUCHER-1",
        voucherRedemption: { voucherId: "VOUCHER-1", grantId: "GRANT-1", status: "REDEEMED", discountUsdt: 1 } })
      .mockResolvedValueOnce({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true,
        orders: [pending, { ...historical, orderNo: "LEGACY-S1", productNo: "stellarbox-s1" },
          { ...historical, orderNo: "LEGACY-CLOUD" }] })
      .mockResolvedValueOnce({ orderNo: pending.orderNo, paymentNo: "PAY-NEW", paymentStatus: "PAID", orderStatus: "COMPLETED",
        activationStatus: "ACTIVATED", canonicalStatus: "activated", amountUsdt: 18.9, paymentMethod: "UVEL_WALLET",
        walletBalanceAfterUsdt: 81.1, idempotent: false, source: "server", sourceEnvironment: "PRODUCTION",
        runId: "", serverCanonical: true });
    const api = createOrderApi({ request } as unknown as ApiClient, "prod");
    const created = await api.create({ productNo: "cloud-share", quantity: 1, voucherId: "VOUCHER-1", idempotencyKey: "create-new" });
    const persisted = (await api.list()).orders.find(row => row.orderNo === created.orderNo);
    expect(persisted).toMatchObject({ canonicalStatus: "placed", amountUsdt: created.amountUsdt, discountUsdt: created.discountUsdt });
    await expect(api.pay(created.orderNo, `wallet-pay:${created.orderNo}`)).resolves.toMatchObject({
      orderNo: pending.orderNo, canonicalStatus: "activated", walletBalanceAfterUsdt: 81.1 });
    expect(request.mock.calls.map(([call]) => [call.method, call.path])).toEqual([
      ["POST", "/api/orders"], ["GET", "/api/orders?pageSize=50"], ["POST", "/api/orders/ORD-NEW/pay"],
    ]);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("posts the order pay command and accepts only an activated wallet receipt", async () => {
    const request = vi.fn().mockResolvedValue({
      orderNo: "ORD-1",
      paymentNo: "PAY-WALLET-1",
      paymentStatus: "PAID",
      orderStatus: "COMPLETED",
      activationStatus: "ACTIVATED",
      canonicalStatus: "activated",
      amountUsdt: 10,
      paymentMethod: "UVEL_WALLET",
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

  it.each(["NEXGRID_WALLET", "UNKNOWN_WALLET"])("rejects an unrecognized payment provider %s", async paymentMethod => {
    const api = createOrderApi({ request: vi.fn().mockResolvedValue({
      orderNo: "ORD-1", paymentNo: "PAY-WALLET-1", paymentStatus: "PAID", orderStatus: "COMPLETED",
      activationStatus: "ACTIVATED", canonicalStatus: "activated", amountUsdt: 10, paymentMethod,
      walletBalanceAfterUsdt: 15, idempotent: false, serverCanonical: true, source: "server",
      sourceEnvironment: "PRODUCTION", runId: "",
    }) } as unknown as ApiClient, "prod");
    await expect(api.pay("ORD-1", "wallet-pay-key"))
      .rejects.toMatchObject({ kind: "protocol", message: "ORDER_RESPONSE_INVALID" });
  });

  it("rejects a receipt that is not synchronously paid and activated", async () => {
    const api = createOrderApi({ request: vi.fn().mockResolvedValue({
      orderNo: "ORD-1", paymentNo: "PAY-WALLET-1",
      paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT",
      activationStatus: "WAITING_PAYMENT", canonicalStatus: "placed",
      amountUsdt: 10, paymentMethod: "UVEL_WALLET",
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
