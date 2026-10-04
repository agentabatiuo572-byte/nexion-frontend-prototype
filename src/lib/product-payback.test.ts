import { describe, expect, it } from "vitest";
import { estimatePaybackDays } from "./product-payback";

describe("estimatePaybackDays", () => {
  it("does not turn zero, missing, or non-finite daily earnings into a zero-day payback", () => {
    expect(estimatePaybackDays(1, 0)).toBeNull();
    expect(estimatePaybackDays(1, Number.NaN)).toBeNull();
    expect(estimatePaybackDays(1, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("keeps the existing rounded estimate for a finite positive price and daily earnings", () => {
    expect(estimatePaybackDays(1299, 10)).toBe(130);
  });
});