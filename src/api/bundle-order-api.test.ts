import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createBundleOrderApi } from "./bundle-order-api";
import { setCurrentCommerceSandboxRun } from "./order-api";

describe("bundle order API", () => {
  it("creates one server-priced bundle", async () => {
    const request = vi.fn().mockResolvedValue({
      orderNo: "BND-1", orderType: "BUNDLE", itemCount: 2,
      productNos: ["stellarbox-s1", "stellarbox-pro"], subtotalUsdt: 300,
      discountRate: 0.05, discountUsdt: 15, amountUsdt: 285,
      paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT", idSource: "server",
    });
    const api = createBundleOrderApi({ request } as unknown as ApiClient);
    await expect(api.create(["stellarbox-s1", "stellarbox-pro"], "bundle-key"))
      .resolves.toMatchObject({ orderNo: "BND-1", amountUsdt: 285 });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: "/api/orders/bundle", idempotencyKey: "bundle-key",
    }));
  });

  it("rejects client-like or inconsistent totals", async () => {
    const request = vi.fn().mockResolvedValue({
      orderNo: "BND-1", orderType: "BUNDLE", itemCount: 2,
      productNos: ["a", "b"], subtotalUsdt: 300, discountRate: 0.05,
      discountUsdt: 15, amountUsdt: 300, paymentStatus: "PENDING",
      orderStatus: "PENDING_PAYMENT", idSource: "client",
    });
    await expect(createBundleOrderApi({ request } as unknown as ApiClient)
      .create(["a", "b"], "bundle-key")).rejects.toMatchObject({ message: "BUNDLE_ORDER_RESPONSE_INVALID" });
  });

  it("accepts a run-scoped sandbox-server receipt", async () => {
    setCurrentCommerceSandboxRun("sandbox-run-20260815");
    const request = vi.fn().mockResolvedValue({
      orderNo: "BND-SBX-1", orderType: "BUNDLE", itemCount: 2,
      productNos: ["stellarbox-s1", "stellarbox-pro"], subtotalUsdt: 300,
      discountRate: 0.05, discountUsdt: 15, amountUsdt: 285,
      paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT", idSource: "sandbox-server",
      source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260815",
    });
    await expect(createBundleOrderApi({ request } as unknown as ApiClient)
      .create(["stellarbox-s1", "stellarbox-pro"], "sandbox-key"))
      .resolves.toMatchObject({ orderNo: "BND-SBX-1", idSource: "sandbox-server" });
    setCurrentCommerceSandboxRun(null);
  });

  it("rejects a sandbox receipt from another run", async () => {
    setCurrentCommerceSandboxRun("sandbox-run-current");
    const request = vi.fn().mockResolvedValue({
      orderNo: "BND-SBX-2", orderType: "BUNDLE", itemCount: 2,
      productNos: ["a", "b"], subtotalUsdt: 300, discountRate: 0.05,
      discountUsdt: 15, amountUsdt: 285, paymentStatus: "PENDING",
      orderStatus: "PENDING_PAYMENT", idSource: "sandbox-server", source: "mock",
      sourceEnvironment: "SANDBOX", runId: "sandbox-run-other",
    });
    await expect(createBundleOrderApi({ request } as unknown as ApiClient)
      .create(["a", "b"], "sandbox-key"))
      .rejects.toMatchObject({ message: "BUNDLE_ORDER_RESPONSE_INVALID" });
    setCurrentCommerceSandboxRun(null);
  });
});
