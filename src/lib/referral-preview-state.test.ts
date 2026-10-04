import { describe, expect, it } from "vitest";
import {
  referralCtaMode,
  resolveReferralAttributionCode,
  type ReferralPreviewState,
} from "@/lib/referral-preview-state";

const pages = import.meta.glob([
  "../pages/ref/code.vue",
  "../pages/register/register.vue",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("remote referral preview authority", () => {
  it.each([
    ["idle without a referral", "idle", "ordinary"],
    ["a referral preview in flight", "loading", "pending"],
    ["a server-confirmed referral", "ready", "referral"],
    ["an invalid or failed referral", "unavailable", "ordinary"],
  ] as const)("offers %s as %s", (_label, state: ReferralPreviewState, expected) => {
    expect(referralCtaMode(true, state)).toBe(expected);
  });

  it("keeps a remote attribution code only after its preview is authoritative", () => {
    expect(resolveReferralAttributionCode(true, "ready", "NX7EC754D46B6E"))
      .toBe("NX7EC754D46B6E");
    expect(resolveReferralAttributionCode(true, "loading", "NX7EC754D46B6E")).toBeNull();
    expect(resolveReferralAttributionCode(true, "unavailable", "NX7EC754D46B6E")).toBeNull();
    expect(resolveReferralAttributionCode(false, "idle", "NEXGRID-AB12"))
      .toBe("NEXGRID-AB12");
  });

  it("keeps an ordinary registration route available without claiming a failed invite", () => {
    const source = pages["../pages/ref/code.vue"] ?? "";
    expect(source).toContain("referralCta === 'ordinary'");
    expect(source).toContain("t.register.create");
    expect(source).toContain("referralAttribution.value");
    expect(source).toContain("referralLoadVersion");
    expect(source).toContain("onUnload");
    expect(source).toMatch(/const norm = normalizeRegistrationSponsorCode[\s\S]*?if \(!norm\)/);
    expect(source).toContain("code.value = preview.code");
  });

  it("fences stale register-page invitation previews before they can lock a later route", () => {
    const source = pages["../pages/register/register.vue"] ?? "";
    expect(source).toContain("sponsorPreviewLoadVersion");
    expect(source).toContain("previewLoadVersion !== sponsorPreviewLoadVersion");
    expect(source).toContain("lockedRef.value = preview.code");
    expect(source).toContain("lockedRef.value = null");
  });
});
