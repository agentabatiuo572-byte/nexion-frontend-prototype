import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createH3ObservationApi } from "./h3-observation-api";

describe("H3 authenticated browsing observations", () => {
  it("rejects an empty product and encodes the exact catalog identifier", async () => {
    const request = vi.fn().mockResolvedValue({ accepted: true });
    const api = createH3ObservationApi({ request } as unknown as ApiClient);
    await expect(api.productDetail("  ")).rejects.toMatchObject({ message: "H3_OBSERVATION_PRODUCT_INVALID" });
    expect(request).not.toHaveBeenCalled();
    await api.productDetail(" sku:revision-2 ");
    expect(request).toHaveBeenCalledWith({ method: "POST", path: "/api/store/products/sku%3Arevision-2/detail-observation", authenticated: true });
  });
  it("posts the canonical product detail subject without a request body", async () => {
    const request = vi.fn().mockResolvedValue({ accepted: true });

    await expect(createH3ObservationApi({ request } as unknown as ApiClient)
      .productDetail("stellarbox-pro")).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/store/products/stellarbox-pro/detail-observation",
      authenticated: true,
    });
  });

  it("posts the secondary market subject and rejects a non-accepted response", async () => {
    const request = vi.fn().mockResolvedValue({ accepted: false });
    const api = createH3ObservationApi({ request } as unknown as ApiClient);

    await expect(api.secondaryMarket()).rejects.toMatchObject({ message: "H3_OBSERVATION_RESPONSE_INVALID" });
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/genesis/secondary-market/observation",
      authenticated: true,
    });
  });
});
