import { describe, expect, it } from "vitest";

import { resolveTradeinCheckoutPreflight } from "./tradein-checkout-preflight";

describe("trade-in checkout preflight", () => {
  it("continues an ordinary purchase when optional eligibility fails but capacity is available", async () => {
    const capacity = { decision: "CAPACITY_AVAILABLE", decisionSource: "server" } as const;

    await expect(resolveTradeinCheckoutPreflight(
      Promise.reject(new Error("eligibility unavailable")),
      Promise.resolve(capacity),
    )).resolves.toEqual({ eligibility: null, capacity });
  });

  it("fails closed when the mandatory capacity decision is unavailable", async () => {
    await expect(resolveTradeinCheckoutPreflight(
      Promise.resolve({ eligible: false }),
      Promise.reject(new Error("capacity unavailable")),
    )).rejects.toThrow("capacity unavailable");
  });
});
