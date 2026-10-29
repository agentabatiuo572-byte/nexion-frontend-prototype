import { describe, expect, it } from "vitest";
import detail from "./detail.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";

describe("store detail payback and eligibility copy", () => {
  it("does not compute or show a payback period", () => {
    expect(detail).not.toMatch(/payback/i);
    expect(detail).not.toContain("Math.round(product.value.price / product.value.dailyEarn)");
  });

  it.each([en, zh, vi])("ships no payback copy", (messages) => {
    const values = JSON.stringify(messages.store).match(/:"[^"]*"/g) ?? [];
    expect(values.join("\n")).not.toMatch(/回本|payback|hoàn vốn/i);
  });
});
describe("store detail keeps qualification in its bottom action", () => {
  it("does not repeat qualification, loading or failure cards above the product", () => {
    expect(detail).not.toContain('data-testid="detail-purchase-eligibility"');
    expect(detail).not.toContain('data-testid="detail-purchase-ineligible"');
    expect(detail).not.toContain('data-testid="detail-purchase-policy-facts"');
    expect(detail).toContain("toast.error(t.value.store.purchaseEligibilityError)");
    expect(detail).toContain("purchaseEligibilityUnlockHref(eligibility.value.snapshot!, product.value.id)");
  });

  it("uses only a confirmed activated phone for personal comparison", () => {
    expect(detail).toContain("app.remoteFleetHasSnapshot ? activePhoneDailyRate(app.visibleDevices) : 0");
    expect(detail).toContain("storeYieldMultiplier(product.value.dailyEarn, phoneDailyEarnValue.value)");
    expect(detail).toContain('v-if="!isShare && phoneDailyEarnValue > 0"');
  });
});
