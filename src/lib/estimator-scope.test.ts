import { describe, expect, it } from "vitest";
import { createEstimatorScope, isCurrentEstimatorScope, type EstimatorScope } from "./estimator-scope";

describe("onboarding estimator response fence", () => {
  it("rejects a result after account switch", () => {
    const current = createEstimatorScope("user:1", 3, 1);
    expect(isCurrentEstimatorScope(current, { ...current, accountKey: "user:2", accountEpoch: 4 })).toBe(false);
  });

  it("rejects a result after page unmount generation", () => {
    const current: EstimatorScope = createEstimatorScope("user:1", 3, 1);
    expect(isCurrentEstimatorScope(current, { ...current, generation: 2 })).toBe(false);
  });
});
