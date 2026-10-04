import { describe, expect, it } from "vitest";
import checkoutSource from "./checkout.vue?raw";
import trialPageSource from "../me/trial.vue?raw";

describe("trial conversion checkout route", () => {
  it("canonicalizes the policy alias before opening or loading checkout", () => {
    expect(trialPageSource).toContain("resolveTrialCheckoutProductId(cfg.value.trialProductId)");
    expect(checkoutSource).toContain("resolveTrialCheckoutProductId(o.product)");
    expect(trialPageSource).toContain("source=trial");
  });

  it("uses the same canonical id when deciding whether trial credit applies", () => {
    expect(checkoutSource).toContain("resolveTrialCheckoutProductId(cfg.trialProductId)");
    expect(checkoutSource).not.toContain("productId.value !== cfg.trialProductId");
  });

  it("does not send a trial conversion through the ordinary hardware-quota gate", () => {
    expect(checkoutSource).toContain("const trialConversion = trialQuoteAt(mockServerNow()).applied");
    expect(checkoutSource).toContain('const eligibility = trialConversion ? "eligible" : await refreshPurchaseEligibility(routeScope);');
    expect(checkoutSource).toContain('if (!isCurrentCheckoutRoute(routeScope) || eligibility === "stale") return;');
    expect(checkoutSource).toContain('if (eligibility === "ineligible")');
    expect(checkoutSource).toContain("if (!trialQuote.applied && purchaseBlockedNow)");
  });

  it("pops an unavailable trial checkout instead of leaving a broken page in history", () => {
    expect(checkoutSource).toContain('trialCheckoutSource = o.source === "trial"');
    expect(checkoutSource).toContain("if (!pp)");
    expect(checkoutSource).toContain('navBack("/pages/me/trial")');
    expect(checkoutSource).toContain("trialProductUnavailable");
    const unavailableBlock = checkoutSource.slice(
      checkoutSource.indexOf("if (!pp)"),
      checkoutSource.indexOf("const trialConversion"),
    );
    expect(unavailableBlock).toContain("setTimeout");
    expect(unavailableBlock.indexOf('navBack("/pages/me/trial")'))
      .toBeLessThan(unavailableBlock.indexOf("uni.showToast"));
  });
});
