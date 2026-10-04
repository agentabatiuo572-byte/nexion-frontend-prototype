import { describe, expect, it } from "vitest";
import { withdrawalLimitFacts } from "./withdrawal-limit-facts";

describe("withdrawal limit facts", () => {
  const now = Date.UTC(2026, 8, 3, 8, 0, 0);

  it("keeps the per-withdrawal maximum separate from the daily count allowance", () => {
    expect(withdrawalLimitFacts({
      perWithdrawalMaximum: 80,
      dailyLimitCount: 3,
      withdrawals: [{ submittedAt: now }, { submittedAt: now - 60_000 }],
      now,
    })).toEqual({
      perWithdrawalMaximum: 80,
      dailyLimitConfigured: true,
      dailyUsedCount: 2,
      dailyRemainingCount: 1,
      dailyAmountLimitConfigured: false,
    });
  });

  it("never manufactures a daily money limit when the server only configures a count", () => {
    expect(withdrawalLimitFacts({
      perWithdrawalMaximum: 80,
      dailyLimitCount: 0,
      withdrawals: [{ submittedAt: now }],
      now,
    })).toMatchObject({
      dailyLimitConfigured: false,
      dailyUsedCount: 1,
      dailyRemainingCount: null,
      dailyAmountLimitConfigured: false,
    });
  });
});
