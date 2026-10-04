import { describe, expect, it } from "vitest";
import { isCurrentOnboardingCalibrationScope, type OnboardingCalibrationScope } from "./onboarding-calibration-scope";

describe("onboarding calibration request scope", () => {
  const scope: OnboardingCalibrationScope = { accountKey: "user:9", accountEpoch: 4, generation: 2 };

  it("rejects a response after account logout/login or route generation changes", () => {
    expect(isCurrentOnboardingCalibrationScope(scope, scope)).toBe(true);
    expect(isCurrentOnboardingCalibrationScope(scope, { ...scope, accountEpoch: 5 })).toBe(false);
    expect(isCurrentOnboardingCalibrationScope(scope, { ...scope, generation: 3 })).toBe(false);
    expect(isCurrentOnboardingCalibrationScope(scope, { ...scope, accountKey: "user:10" })).toBe(false);
  });
});
