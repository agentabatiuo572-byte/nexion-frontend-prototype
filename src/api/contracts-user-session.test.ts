import { describe, expect, it } from "vitest";

import { isUserSession } from "./contracts";

describe("user session onboarding contract", () => {
  it("requires the server-owned onboarding completion flag", () => {
    expect(isUserSession({
      userId: 42,
      countryCode: "+84",
      phone: "912345678",
      nickname: "NexGrid user",
    })).toBe(false);
  });

  it.each([
    ["+84", "912345678"],
    ["+86", "13800138000"],
  ])("accepts a complete session for supported country code %s", (countryCode, phone) => {
    expect(isUserSession({
      userId: 42,
      countryCode,
      phone,
      nickname: "NexGrid user",
      onboardingComplete: true,
    })).toBe(true);
  });

  it.each(["+1", "+81", "+44", "84", " +84"])(
    "rejects a server or persisted session outside the exact country-code allowlist: %s",
    (countryCode) => {
      expect(isUserSession({
        userId: 42,
        countryCode,
        phone: "9012345678",
        nickname: "NexGrid user",
        onboardingComplete: true,
      })).toBe(false);
    },
  );
});
