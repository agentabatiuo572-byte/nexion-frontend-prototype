import { describe, expect, it } from "vitest";
import { isCurrentWithdrawalFactsRequest } from "./withdrawal-facts-request-fence";

describe("withdrawal financial-facts request fence", () => {
  const request = { accountKey: "user:7", accountBindingEpoch: 3, runtimeEpoch: 4, sequence: 2 };

  it("accepts only the response for the same account, runtime revision, and request sequence", () => {
    expect(isCurrentWithdrawalFactsRequest(request, {
      accountKey: "user:7", accountBindingEpoch: 3, runtimeEpoch: 4, sequence: 2,
    })).toBe(true);
  });

  it.each([
    ["account changed", { accountKey: "user:8", accountBindingEpoch: 3, runtimeEpoch: 4, sequence: 2 }],
    ["same account rebound", { accountKey: "user:7", accountBindingEpoch: 4, runtimeEpoch: 4, sequence: 2 }],
    ["runtime revision changed", { accountKey: "user:7", accountBindingEpoch: 3, runtimeEpoch: 5, sequence: 2 }],
    ["newer request began", { accountKey: "user:7", accountBindingEpoch: 3, runtimeEpoch: 4, sequence: 3 }],
  ])("rejects a stale response after %s", (_reason, current) => {
    expect(isCurrentWithdrawalFactsRequest(request, current)).toBe(false);
  });
});
