import { expect, test } from "vitest";
import { purchaseEligibilityPolicyHasNoRestriction, purchaseEligibilityUnlockHref, resolvePurchaseEligibilityMessage } from "./purchase-eligibility-copy";

const base = {
  productNo: "stellarbox-pro-v2",
  policies: [
    { policy: "E1" as const, eligible: true, decisionCode: "ELIGIBLE", mode: "ALL" as const, conditions: [] },
    { policy: "F4B" as const, eligible: true, decisionCode: "F4B_NOT_CONFIGURED", mode: "ALL" as const, conditions: [] },
  ],
  evaluatedAt: 1786856400000,
  source: "nx_product + nx_admin_device_sku + nx_user" as const,
  sourceEnvironment: "PRODUCTION" as const,
  runId: null,
  serverCanonical: true as const,
};

test("maps only canonical server decision codes to deny copy", () => {
  expect(resolvePurchaseEligibilityMessage("ready", { ...base, eligible: false, decisionCode: "PURCHASE_GATE_NOT_MET" })).toBe("ineligible");
  expect(resolvePurchaseEligibilityMessage("ready", { ...base, eligible: false, decisionCode: "PURCHASE_GATE_SOLD_OUT" })).toBe("quotaDepleted");
  expect(resolvePurchaseEligibilityMessage("ready", { ...base, eligible: false, decisionCode: "F4B_REQUIREMENTS_NOT_MET" })).toBe("ineligible");
  expect(resolvePurchaseEligibilityMessage("ready", { ...base, eligible: false, decisionCode: "F4B_MONTHLY_QUOTA_EXHAUSTED" })).toBe("quotaDepleted");
});

test("unknown, malformed, or failed remote decisions map to error and never local gate copy", () => {
  expect(resolvePurchaseEligibilityMessage("error", null)).toBe("error");
  expect(resolvePurchaseEligibilityMessage("ready", { ...base, eligible: false, decisionCode: "CLIENT_GUESSED" })).toBe("error");
  expect(resolvePurchaseEligibilityMessage("ready", { ...base, eligible: true, decisionCode: "PURCHASE_GATE_NOT_MET" })).toBe("error");
  expect(resolvePurchaseEligibilityMessage("ready", { ...base, eligible: true, decisionCode: "ELIGIBLE" })).toBe("eligible");
});

test("known empty E1 and F4B policies mean no extra restriction, while unknown empty policies stay unconfirmed", () => {
  expect(purchaseEligibilityPolicyHasNoRestriction(base.policies[0])).toBe(true);
  expect(purchaseEligibilityPolicyHasNoRestriction(base.policies[1])).toBe(true);
  expect(purchaseEligibilityPolicyHasNoRestriction({ ...base.policies[1], decisionCode: "F4B_QUOTA_UNAVAILABLE" })).toBe(false);
  expect(purchaseEligibilityPolicyHasNoRestriction({ ...base.policies[1], eligible: false })).toBe(false);
  expect(purchaseEligibilityPolicyHasNoRestriction({ ...base.policies[0], conditions: [
    { kind: "rank", current: 2, required: 2, gap: 0, met: true },
  ] })).toBe(false);
});

test("rank-only product opens rank progression instead of another product quota", () => {
  const rank = { kind: "rank" as const, current: 0, required: 2, gap: 2, met: false };
  const snapshot = { ...base, eligible: false, decisionCode: "PURCHASE_GATE_NOT_MET", policies: [
    { ...base.policies[0], eligible: false, decisionCode: "PURCHASE_GATE_NOT_MET", conditions: [rank] },
    base.policies[1],
  ] };
  expect(purchaseEligibilityUnlockHref(snapshot, "stellarbox-pro-v2")).toBe("/pages/team/rank");
  const quotaCondition = { kind: "activeDirect" as const, current: 0, required: 5, gap: 5, met: false };
  expect(purchaseEligibilityUnlockHref({ ...snapshot, policies: [snapshot.policies[0],
    { ...base.policies[1], conditions: [{ ...quotaCondition, current: 5, gap: 0, met: true }] }] }, "stellarbox-pro-v2"))
    .toBe("/pages/team/rank");
  expect(purchaseEligibilityUnlockHref({ ...snapshot, policies: [snapshot.policies[0],
    { ...base.policies[1], conditions: [quotaCondition] }] }, "stellarbox-pro-v2"))
    .toBe("/pages/team/quota?product=stellarbox-pro-v2");
});
