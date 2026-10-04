import { describe, expect, it } from "vitest";
import detail from "./detail.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";

describe("store detail payback and eligibility copy", () => {
  it("renders an unavailable payback without a day suffix and keeps CTA copy finite", () => {
    expect(detail).toContain("estimatePaybackDays");
    expect(detail).toContain("if (days === null)");
    expect(detail).toContain("t.value.store.detPaybackUnavailable");
    expect(detail).not.toContain("Math.round(product.value.price / product.value.dailyEarn)");
  });

  it("uses unmet-condition copy for a known server denial while retaining fail-closed copy for unknown state", () => {
    expect(detail).toContain("eligibilityDenyBody");
    expect(detail).toContain("t.store.purchaseEligibilityFailClosed");
    expect(detail).toContain("t.value.store.purchaseEligibilityConditionsUnmet");
    expect(detail).toContain("v-if=\"purchaseEligibilityMessage === 'error'\"");
  });

  it.each([en, zh, vi])("provides trilingual unavailable-payback and known-denial copy", (messages) => {
    expect(messages.store.detPaybackUnavailable).toBeTruthy();
    expect(messages.store.detPaybackUnavailableNote).toBeTruthy();
    expect(messages.store.purchaseEligibilityConditionsUnmet).toBeTruthy();
  });
});
/**
 * zentao #29:购买资格卡对「没有条件事实」的策略宣称「结果:已满足」。
 *
 * 已知 E1/ELIGIBLE 与 F4B/F4B_NOT_CONFIGURED 的空条件表示没有额外限制；
 * F4B_QUOTA_UNAVAILABLE 等未知空条件仍不得宣称「已满足」。
 */
describe("store detail eligibility never claims a met result without facts", () => {
  it("keeps unknown and denied server decisions visibly closed", () => {
    expect(detail).toContain("remoteApiEnabled && eligibility.status !== 'ready'");
    expect(detail).toContain("t.store.purchaseEligibilityFailClosed");
    expect(detail).toContain("remoteApiEnabled && !eligibility.eligible");
    expect(detail).toContain("eligibilityDenyBody");
    expect(detail).toContain("t.value.store.purchaseEligibilityConditionsUnmet");
    const metResults = detail.match(/<text\b[^>]*>\{\{\s*policy\.eligible\s*\?[^}]*purchaseEligibilityPolicyMet[^}]*\}\}<\/text>/g) ?? [];
    expect(metResults).toHaveLength(1);
    expect(metResults[0]).toContain('v-if="eligibilityPolicyHasFacts(policy)"');
    expect(detail).toContain('v-else-if="eligibilityPolicyHasNoRestriction(policy)"');
    expect(detail).toContain('{{ t.store.purchaseEligibilityNoExtraRestriction }}');
    expect(detail).toContain('v-else class="block" style="margin-top: 3px; font-size: 12px; color: var(--v5-ink-3)">{{ t.store.purchaseEligibilityNoFacts }}');
  });

  it.each([en, zh, vi])("provides trilingual no-extra-restriction copy", (messages) => {
    expect(messages.store.purchaseEligibilityNoExtraRestriction).toBeTruthy();
    // 三语必须各自成句,不能整份复制粘贴。
    const values = [en.store.purchaseEligibilityNoExtraRestriction, zh.store.purchaseEligibilityNoExtraRestriction, vi.store.purchaseEligibilityNoExtraRestriction];
    expect(new Set(values).size).toBe(3);
  });

  it("uses only a confirmed activated phone for personal comparison", () => {
    expect(detail).toContain("app.remoteFleetHasSnapshot ? activePhoneDailyRate(app.visibleDevices) : 0");
    expect(detail).toContain("storeYieldMultiplier(product.value.dailyEarn, phoneDailyEarnValue.value)");
    expect(detail).toContain('v-if="!isShare && phoneDailyEarnValue > 0"');
    expect(detail).not.toContain("earnConfig.phoneTiers.value?.tiers");
  });

  it("shows server policy facts without exposing raw backend codes", () => {
    expect(detail).toContain('data-testid="detail-purchase-policy-facts"');
    expect(detail).toContain("eligibilityPolicyTitle(policy)");
    expect(detail).toContain("eligibilityConditionText(condition)");
    expect(detail).not.toContain("{{ policy.decisionCode }}");
  });
});
