import { describe, expect, it } from "vitest";
import source from "./missed-income-banner.vue?raw";
import { en } from "../../i18n/messages/en";
import { vi as viDict } from "../../i18n/messages/vi";
import { zh } from "../../i18n/messages/zh";

describe("earn missed-income server authority", () => {
  it("uses the Java Home projection and response timestamp in formal remote mode", () => {
    expect(source).toContain("app.homeTruth?.doTheMath");
    expect(source).toContain("app.homeTruth?.generatedAt");
    expect(source).toContain("if (remoteApiEnabled)");
    expect(source).toContain("if (!projection) return null");
    expect(source).toContain("app.user.joinedAt > 0");
    expect(source).toContain("app.user.joinedAt <= authoritativeNow.value");
    expect(source).toContain("&& joinedAtValid.value");
  });

  it("does not run the browser-time ticker in formal remote mode", () => {
    expect(source).toContain("if (remoteApiEnabled) return;");
    expect(source).toContain("if (!remoteApiEnabled) return localNow.value");
  });

  it("keeps today's ceiling gap visible while a free trial is active", () => {
    expect(source).not.toContain("trialReservesSlotNow");
    expect(source).not.toContain("!trialActive.value");
  });

  it("keeps mock-only derivation isolated behind the non-remote branch", () => {
    const remoteBranch = source.indexOf("if (remoteApiEnabled) {");
    const localDerivation = source.indexOf("derivePromoUpgrade(app.visibleDevices)");
    expect(remoteBranch).toBeGreaterThanOrEqual(0);
    expect(localDerivation).toBeGreaterThan(remoteBranch);
  });

  // The banner used to render the ceiling difference as "−$X missed today /
  // cumulative missed" with a "Stop the bleeding" CTA, which asserts the user
  // lost income they never had. The gap is a device-pricing comparison.
  it("never renders the ceiling gap as a subtracted loss", () => {
    // U+2212 minus, the glyph the loss framing used.
    expect(source).not.toMatch(/−/);
    expect(source).not.toMatch(/\{\{\s*missedToday/);
    expect(source).not.toMatch(/\{\{\s*cumulativeMissedRounded/);
    for (const dict of [en, viDict, zh]) {
      expect(dict.earn.missedToday).not.toMatch(/missed|bỏ lỡ|错过/i);
      expect(dict.earn.cumulativeMissed).not.toMatch(/missed|bỏ lỡ|错过/i);
    }
  });

  it("drops the stop-bleeding claim and reuses the existing higher-tier CTA", () => {
    expect(source).not.toContain("stopBleeding");
    expect(source).toContain("t.earn.capExplainCta");
    for (const dict of [en, viDict, zh]) {
      expect(dict.earn).not.toHaveProperty("stopBleeding");
    }
  });

  it("labels the figures as a ceiling estimate and disclaims actual loss", () => {
    expect(source).toContain("t.earn.ceilingGapDisclaimer");
    for (const dict of [en, viDict, zh]) {
      // The disclaimer must deny actual loss, so a future edit cannot quietly
      // restore the "income you lost" reading.
      expect(dict.earn.ceilingGapDisclaimer).toMatch(/not income you lost|并非你实际已损失|không phải thu nhập bạn đã mất/i);
    }
  });

  it("hides the card entirely when no authoritative comparison exists", () => {
    expect(source).toContain("promo.value !== null");
    expect(source).toContain("promo.value.multiplier !== 0");
    expect(source).toMatch(/v-if="show"/);
  });
});
