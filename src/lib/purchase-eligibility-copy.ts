import {
  PURCHASE_ELIGIBILITY_SOURCE,
  type PurchaseEligibilityPolicy,
  type PurchaseEligibilitySnapshot,
} from "@/api/purchase-eligibility-api";

export type PurchaseEligibilityRequestStatus = "idle" | "loading" | "ready" | "error";
export type PurchaseEligibilityMessage = "eligible" | "ineligible" | "quotaDepleted" | "error";

/** Empty conditions are open only when the server names a known open policy. */
export function purchaseEligibilityPolicyHasNoRestriction(policy: PurchaseEligibilityPolicy): boolean {
  return policy.eligible && policy.conditions.length === 0
    && (policy.policy === "E1" && policy.decisionCode === "ELIGIBLE"
      || policy.policy === "F4B" && policy.decisionCode === "F4B_NOT_CONFIGURED");
}

/** Send a rank-only denial to the rank progression page, not an unrelated quota tier. */
export function purchaseEligibilityUnlockHref(snapshot: PurchaseEligibilitySnapshot, productNo: string): string {
  const hasUnmetQuotaConditions = snapshot.policies.some((policy) =>
    policy.policy === "F4B" && policy.conditions.some((condition) => !condition.met));
  const needsRank = snapshot.policies.some((policy) =>
    policy.policy === "E1" && policy.conditions.some((condition) => condition.kind === "rank" && !condition.met));
  if (needsRank && !hasUnmetQuotaConditions) return "/pages/team/rank";
  return `/pages/team/quota?product=${encodeURIComponent(productNo)}`;
}

/**
 * Resolve checkout copy from the server response only. A response that is
 * unknown, internally inconsistent, or absent is an error: local rank/team
 * snapshots must never turn it into a more specific deny reason.
 */
export function resolvePurchaseEligibilityMessage(
  status: PurchaseEligibilityRequestStatus,
  snapshot: PurchaseEligibilitySnapshot | null,
): PurchaseEligibilityMessage {
  if (status !== "ready" || !snapshot) return "error";
  if (snapshot.source !== PURCHASE_ELIGIBILITY_SOURCE) return "error";
  if (snapshot.decisionCode === "ELIGIBLE") return snapshot.eligible ? "eligible" : "error";
  if (snapshot.decisionCode === "PURCHASE_GATE_NOT_MET") return snapshot.eligible ? "error" : "ineligible";
  if (snapshot.decisionCode === "PURCHASE_GATE_SOLD_OUT") return snapshot.eligible ? "error" : "quotaDepleted";
  if (snapshot.decisionCode === "F4B_REQUIREMENTS_NOT_MET") return snapshot.eligible ? "error" : "ineligible";
  if (snapshot.decisionCode === "F4B_MONTHLY_QUOTA_EXHAUSTED") return snapshot.eligible ? "error" : "quotaDepleted";
  return "error";
}
