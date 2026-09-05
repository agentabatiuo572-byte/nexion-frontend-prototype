import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createCommercePaymentApi } from "./commerce-payment-api";
import { setCurrentCommerceSandboxRun } from "./order-api";

describe("commerce sandbox payment API", () => {
  it("posts a user-confirmed payment and validates sandbox provenance", async () => {
    setCurrentCommerceSandboxRun("sandbox-run-1");
    const request = vi.fn().mockResolvedValue({
      orderNo: "CSO-1", paymentNo: "PAY-SBX-0000000000000001", paymentStatus: "PAID", orderStatus: "PAID",
      canonicalStatus: "paid", source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-1",
    });
    const api = createCommercePaymentApi({ request } as unknown as ApiClient);
    await expect(api.confirm("CSO-1", "pay-key")).resolves.toMatchObject({
      orderNo: "CSO-1", paymentNo: "PAY-SBX-0000000000000001", sourceEnvironment: "SANDBOX",
    });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST", path: "/api/orders/CSO-1/pay", idempotencyKey: "pay-key",
    }));
    setCurrentCommerceSandboxRun(null);
  });

  it("rejects a production-shaped or malformed payment receipt", async () => {
    setCurrentCommerceSandboxRun("sandbox-run-1");
    const request = vi.fn().mockResolvedValue({
      orderNo: "CSO-1", paymentNo: "PAY-SBX-0000000000000001", paymentStatus: "PAID", orderStatus: "PAID",
      canonicalStatus: "paid", source: "server", sourceEnvironment: "PRODUCTION",
    });
    await expect(createCommercePaymentApi({ request } as unknown as ApiClient)
      .confirm("CSO-1", "pay-key")).rejects.toMatchObject({ message: "COMMERCE_PAYMENT_RESPONSE_INVALID" });
    setCurrentCommerceSandboxRun(null);
  });
});
