import { describe, expect, it } from "vitest";
import {
  computeWithdrawalMaximum,
  formatWithdrawalRatioPercent,
  resolveWithdrawalUseMax,
} from "./withdrawal-use-max";

describe("withdrawal use-max action", () => {
  it("derives the authoritative 8 maximum from a 10 balance and the D5 80 percent ratio", () => {
    expect(computeWithdrawalMaximum(10, 0.8)).toBe(8);
  });

  it("does not round a configured fractional percentage in the explanation", () => {
    expect(formatWithdrawalRatioPercent(0.805)).toBe("80.5");
  });

  it("does not fill an amount that can never pass the server minimum", () => {
    expect(resolveWithdrawalUseMax(8, 20)).toEqual({
      amount: null,
      reason: "below-minimum",
      shortfall: 12,
    });
  });

  it("fills the exact server withdrawable maximum once it reaches the minimum", () => {
    expect(resolveWithdrawalUseMax(20, 20)).toEqual({
      amount: "20.00",
      reason: null,
      shortfall: 0,
    });
  });

  it("signals the caller to preserve an existing input when use-max is below the minimum", () => {
    const existingInput = "6.50";
    const decision = resolveWithdrawalUseMax(computeWithdrawalMaximum(10, 0.8), 20);
    const nextInput = decision.amount ?? existingInput;

    expect(nextInput).toBe(existingInput);
  });
});
