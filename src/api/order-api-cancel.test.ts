import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createOrderApi, advanceRuntimeRevision } from "./order-api";

describe("order cancellation API", () => {
  afterEach(() => advanceRuntimeRevision(null));

  it("sends the authenticated idempotent cancel command and parses server state", async () => {
    const request = vi.fn().mockResolvedValue({
      orderNo: "ORD-1", orderStatus: "CANCELLED", paymentStatus: "CANCELLED",
      source: "server", sourceEnvironment: "PRODUCTION", runId: "",
      serverCanonical: true, idempotent: false,
    });
    const api = createOrderApi({ request } as unknown as ApiClient, "prod");
    await expect(api.cancel("ORD-1", "cancel-key")).resolves.toMatchObject({
      orderNo: "ORD-1", source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST", path: "/api/orders/ORD-1/cancel", idempotencyKey: "cancel-key",
    }));
  });

  it.each([null, "run-20260816"]) ("rejects production cancellation responses without an empty run (%s)", async (runId) => {
    const request = vi.fn().mockResolvedValue({
      orderNo: "ORD-1", orderStatus: "CANCELLED", paymentStatus: "CANCELLED",
      source: "server", sourceEnvironment: "PRODUCTION", runId,
      serverCanonical: true, idempotent: false,
    });
    const api = createOrderApi({ request } as unknown as ApiClient, "prod");
    await expect(api.cancel("ORD-1", "cancel-key")).rejects.toMatchObject({ kind: "protocol" });
  });

  it("rejects retired sandbox cancellation even when the catalog run matches", async () => {
    advanceRuntimeRevision("run-20260816");
    const request = vi.fn().mockResolvedValue({
      orderNo: "ORD-1", orderStatus: "CANCELLED", paymentStatus: "CANCELLED",
      source: "mock", sourceEnvironment: "SANDBOX", runId: "run-20260816",
      serverCanonical: true, idempotent: true,
    });
    const api = createOrderApi({ request } as unknown as ApiClient, "dev");
    await expect(api.cancel("ORD-1", "cancel-key")).rejects.toMatchObject({
      kind: "protocol", message: "ORDER_RESPONSE_INVALID",
    });
  });

  it("rejects a sandbox cancellation from a different catalog run", async () => {
    advanceRuntimeRevision("run-20260816");
    const request = vi.fn().mockResolvedValue({
      orderNo: "ORD-1", orderStatus: "CANCELLED", paymentStatus: "CANCELLED",
      source: "mock", sourceEnvironment: "SANDBOX", runId: "run-20260815",
      serverCanonical: true, idempotent: false,
    });
    const api = createOrderApi({ request } as unknown as ApiClient, "dev");
    await expect(api.cancel("ORD-1", "cancel-key")).rejects.toMatchObject({ kind: "protocol" });
  });
});
