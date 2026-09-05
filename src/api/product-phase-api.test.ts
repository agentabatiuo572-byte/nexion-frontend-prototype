import { describe, expect, it, vi } from "vitest";
import { createProductPhaseApi } from "./product-phase-api";

describe("product phase api", () => {
  it("accepts the H1 server phase used by the remote storefront", async () => {
    const request = vi.fn().mockResolvedValue({
      phase: "P2",
      source: "H1_GROWTH_RHYTHM",
      devOverrideAllowed: false,
    });

    await expect(createProductPhaseApi({ request } as never).current()).resolves.toEqual({
      phase: "P2",
      source: "H1_GROWTH_RHYTHM",
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/product/phase" });
  });

  it("fails closed when the backend does not return a canonical phase", async () => {
    const request = vi.fn().mockResolvedValue({
      phase: "2",
      source: "H1_GROWTH_RHYTHM",
      devOverrideAllowed: false,
    });

    await expect(createProductPhaseApi({ request } as never).current())
      .rejects.toMatchObject({ message: "PRODUCT_PHASE_RESPONSE_INVALID" });
  });
});
