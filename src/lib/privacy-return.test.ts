import { describe, expect, it } from "vitest";
import { privacyPolicyHref, resolvePrivacyReturn } from "./privacy-return";

describe("privacy return destination", () => {
  it("keeps a registration query on a valid caller", () => {
    expect(resolvePrivacyReturn("/pages/register/register?ref=Q1%26next%3Dother")).toBe("/pages/register/register?ref=Q1%26next%3Dother");
  });
  it.each([undefined, "", "https://example.invalid", "//example.invalid", "javascript:alert(1)", "/team", "/pages/missing/missing", "/pages/onboarding/privacy", "/pages/me/wallet", "/pages/onboarding/../../missing", "/pages/%ZZ"])('falls back safely for %s', raw => {
    expect(resolvePrivacyReturn(raw)).toBe("/pages/onboarding/intro");
  });
  it("normalizes an encoded caller before checking it", () => {
    expect(resolvePrivacyReturn("/pages/ref/%63ode?code=Q1")).toBe("/pages/ref/code?code=Q1");
  });
  it.each([
    ["/pages/onboarding/intro", undefined, "/pages/onboarding/intro"],
    ["/pages/register/register", "Q1", "/pages/register/register?ref=Q1"],
    ["/pages/ref/code", "Q1", "/pages/ref/code?code=Q1"],
    ["/pages/register/register", "A&B#C", "/pages/register/register?ref=A%26B%23C"],
  ] as const)("round-trips %s with its attribution", (caller, attribution, expected) => {
    const href = privacyPolicyHref(caller, attribution);
    expect(href.startsWith("/pages/onboarding/privacy?return=")).toBe(true);
    const value = new URLSearchParams(href.split("?")[1]).get("return");
    expect(resolvePrivacyReturn(value)).toBe(expected);
  });
});
