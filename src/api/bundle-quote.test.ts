import { describe, expect, it } from "vitest";
import { quoteBundleAmountUsdt } from "./bundle-quote";

describe("bundle quote precision", () => {
  it("mirrors the server's six-decimal HALF_UP discount then subtraction", () => {
    expect(quoteBundleAmountUsdt([0.5, 0.5], 0.1234565)).toEqual({
      subtotalUsdt: 1,
      discountUsdt: 0.123457,
      amountUsdt: 0.876543,
    });
  });

  it("keeps an empty or single-item display quote valid at zero discount", () => {
    expect(quoteBundleAmountUsdt([], 0)).toEqual({ subtotalUsdt: 0, discountUsdt: 0, amountUsdt: 0 });
    expect(quoteBundleAmountUsdt([2639], 0)).toEqual({ subtotalUsdt: 2639, discountUsdt: 0, amountUsdt: 2639 });
  });
});
