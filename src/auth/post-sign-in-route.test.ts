import { describe, expect, it } from "vitest";
import { resolvePostSignInRoute } from "@/auth/post-sign-in-route";

describe("resolvePostSignInRoute", () => {
  it("sends an ordinary login to Home even when onboarding is incomplete", () => {
    expect(resolvePostSignInRoute({
      onboardingComplete: false,
      requiresRecalibration: false,
      returnTo: null,
    })).toBe("/pages/index/index");
  });

  it("preserves a safe return target for an ordinary login", () => {
    expect(resolvePostSignInRoute({
      onboardingComplete: false,
      requiresRecalibration: false,
      returnTo: "/pages/me/me",
    })).toBe("/pages/me/me");
  });

  it.each([
    "/pages/register/success",
    "/pages/onboarding/estimator",
    "/pages/login/login",
    "/pages/session/kicked",
    "/pages/%72egister/success",
  ])("rejects auth-flow return targets after login: %s", (returnTo) => {
    expect(resolvePostSignInRoute({
      onboardingComplete: false,
      requiresRecalibration: false,
      returnTo,
    })).toBe("/pages/index/index");
  });

  it("keeps explicit registration navigation deferred to the registration flow", () => {
    expect(resolvePostSignInRoute({
      onboardingComplete: false,
      requiresRecalibration: false,
      returnTo: null,
      deferNavigation: true,
    })).toBeNull();
  });

  it("does not let a device recalibration flag hijack a completed login", () => {
    expect(resolvePostSignInRoute({
      onboardingComplete: true,
      requiresRecalibration: true,
      returnTo: null,
    })).toBe("/pages/index/index");
  });
});
