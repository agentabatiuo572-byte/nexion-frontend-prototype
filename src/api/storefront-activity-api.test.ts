import { describe, expect, it, vi } from "vitest";
import { createStorefrontActivityApi } from "./storefront-activity-api";

describe("storefront activity api", () => {
  it("accepts anonymous paid-order facts without inventing identity or viewing fields", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_order/nx_order_item/nx_product",
      sourceEnvironment: "PRODUCTION",
      items: [{ eventType: "ORDER_PAID", productName: "StellarBox Pro", occurredAt: "2026-08-15T11:00" }],
      nextCursor: null,
    });

    await expect(createStorefrontActivityApi({ request } as never).activity(5)).resolves.toEqual({
      sourceEnvironment: "PRODUCTION",
      items: [{ eventType: "ORDER_PAID", productName: "StellarBox Pro", occurredAt: "2026-08-15T11:00" }],
      nextCursor: null,
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/storefront/activity?limit=5" });
  });

  it("rejects malformed social proof instead of filling missing numbers locally", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_product/nx_order/nx_order_item",
      sourceEnvironment: "SANDBOX",
      productName: "StellarBox Pro",
      cumulativeSales: 3,
      windowDays: 30,
    });

    await expect(createStorefrontActivityApi({ request } as never).socialProof("stellarbox-pro", 30))
      .rejects.toMatchObject({ message: "STOREFRONT_SOCIAL_PROOF_RESPONSE_INVALID" });
  });
});
