import { expect, test, vi } from "vitest";

const eligibility = vi.hoisted(() => vi.fn(async () => ({
  canSubmit: true, maxWithdrawableUsdt: 100, route: "pass", riskReasons: [],
  fastLaneApplied: false, waivedGates: [], dailyLimitReached: false,
  dailyCountResetAt: 1, configVersion: "policy-current",
})));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, withdrawalApi: { eligibility } }));

import { requestWithdrawalEligibility } from "./withdrawal-eligibility";

test("remote preflight sends the exact policy version used to display the quote", async () => {
  await requestWithdrawalEligibility("user:test", "USDT-BEP20", "test-address", 100,
    { limitCount: 2, withdrawals: [] }, 20, "policy-current");
  expect(eligibility).toHaveBeenLastCalledWith({
    amount: 20, chain: "USDT-BEP20", address: "test-address", policyVersion: "policy-current",
  });
});
