import { describe, expect, it } from "vitest";
import {
  financialFactState,
  shouldRequestWithdrawalEligibility,
  withdrawalFactsActionsFresh,
} from "./withdrawal-facts-state";

describe("withdrawal financial fact state", () => {
  it("keeps local-mode values available without remote snapshots", () => {
    expect(financialFactState(false, [])).toBe("ready");
  });

  it("does not turn an initial remote read into a zero balance", () => {
    expect(financialFactState(true, [
      { hasSnapshot: false, status: "loading" },
      { hasSnapshot: false, status: "idle" },
    ])).toBe("loading");
  });

  it("marks a failed first read unavailable", () => {
    expect(financialFactState(true, [
      { hasSnapshot: true, status: "ready" },
      { hasSnapshot: false, status: "error" },
    ])).toBe("unavailable");
  });

  it("keeps a confirmed same-account snapshot readable during an ordinary refresh", () => {
    expect(financialFactState(true, [
      { hasSnapshot: true, status: "loading" },
      { hasSnapshot: true, status: "ready" },
      { hasSnapshot: true, status: "loading" },
    ])).toBe("refreshing");
  });

  it("does not present a failed refresh as a current quote", () => {
    expect(financialFactState(true, [
      { hasSnapshot: true, status: "ready" },
      { hasSnapshot: true, status: "error" },
    ])).toBe("unavailable");
  });

  it("is fresh only after every authoritative input is ready", () => {
    expect(financialFactState(true, [
      { hasSnapshot: true, status: "ready" },
      { hasSnapshot: true, status: "ready" },
      { hasSnapshot: true, status: "ready" },
    ])).toBe("ready");
  });

  it("keeps actions disabled across a same-account rebind until its replacement facts are ready", () => {
    const afterRebind = financialFactState(true, [{ hasSnapshot: false, status: "loading" }]);
    expect(withdrawalFactsActionsFresh(afterRebind, afterRebind)).toBe(false);
    expect(withdrawalFactsActionsFresh("ready", "ready")).toBe(true);
  });

  it("does not preflight either normal or small amount against stale facts", () => {
    for (const amount of [75, 10]) {
      expect(shouldRequestWithdrawalEligibility({
        remote: true,
        factsFresh: false,
        policyVersion: "policy-9",
        amount,
        addressLength: 42,
      })).toBe(false);
    }
  });
});
