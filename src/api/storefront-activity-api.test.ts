import { describe, expect, it, vi } from "vitest";
import { createStorefrontActivityApi } from "./storefront-activity-api";

describe("storefront activity api", () => {
  it("accepts anonymous paid-order facts without inventing identity or viewing fields", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_order/nx_order_item/nx_product",
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      items: [{ eventType: "ORDER_PAID", productName: "StellarBox Pro", occurredAt: "2026-08-15T11:00" }],
      nextCursor: null,
    });

    await expect(createStorefrontActivityApi({ request } as never).activity(5)).resolves.toEqual({
      source: "nx_order/nx_order_item/nx_product",
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      items: [{ eventType: "ORDER_PAID", productName: "StellarBox Pro", occurredAt: "2026-08-15T11:00" }],
      nextCursor: null,
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/storefront/activity?limit=5" });
  });

  it("rejects malformed social proof instead of filling missing numbers locally", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_product/nx_order/nx_order_item",
      serverCanonical: true,
      sourceEnvironment: "SANDBOX",
      productName: "StellarBox Pro",
      cumulativeSales: 3,
      windowDays: 30,
    });

    await expect(createStorefrontActivityApi({ request } as never).socialProof("stellarbox-pro", 30))
      .rejects.toMatchObject({ message: "STOREFRONT_SOCIAL_PROOF_RESPONSE_INVALID" });
  });

  it("accepts the Java canonical production projection in development", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_product/nx_order/nx_order_item",
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      productName: "StellarBox Pro",
      cumulativeSales: 3,
      windowDays: 30,
      windowSales: 1,
    });

    await expect(createStorefrontActivityApi({ request } as never, "dev").socialProof("stellarbox-pro", 30))
      .resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "", cumulativeSales: 3, windowSales: 1 });
  });

  it("rejects sandbox social proof in development", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_commerce_sandbox_catalog/nx_commerce_sandbox_order/nx_commerce_sandbox_inventory",
      serverCanonical: true,
      sourceEnvironment: "SANDBOX",
      runId: "sandbox-run-20260815",
      productName: "StellarBox Pro", cumulativeSales: 3, windowDays: 30, windowSales: 1,
    });
    const api = createStorefrontActivityApi({ request } as never, "dev");
    await expect(api.socialProof("stellarbox-pro", 30)).rejects.toMatchObject({ message: "STOREFRONT_SOCIAL_PROOF_RESPONSE_INVALID" });
  });

  it("rejects a production-shaped response without the Java canonical marker", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_order/nx_order_item/nx_product", sourceEnvironment: "PRODUCTION", runId: "",
      items: [], nextCursor: null,
    });
    await expect(createStorefrontActivityApi({ request } as never, "dev").activity())
      .rejects.toMatchObject({ message: "STOREFRONT_ACTIVITY_RESPONSE_INVALID" });
  });
});
