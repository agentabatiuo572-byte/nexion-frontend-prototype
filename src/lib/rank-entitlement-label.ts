import type { EntitlementVRankReward, VRankReward } from "@/store/v-rank";

export function isEntitlementVRankReward(reward: VRankReward): reward is EntitlementVRankReward {
  return reward.type === "VOUCHER" || reward.type === "SKU" || reward.type === "CUSTOM";
}

/**
 * `nx_v_rank_reward_rule.custom_label` is operator-entered free text with no
 * publication review, so it can hold test-harness names. The PC acceptance
 * scripts write `F-A1REVERIFY-<ts>-custom-reward` (tests/e2e/a1-reverify.mjs)
 * and the F1 engine writes `F1ENGINE …` rows; both are internal identifiers,
 * not user copy, and must never reach the public rank page.
 */
const INTERNAL_LABEL_PATTERN = /f1engine|reverify/i;

export function rankEntitlementLabel(reward: EntitlementVRankReward,
  unavailable: { voucher: string; sku: string; custom: string }): string {
  if (reward.type === "CUSTOM") {
    const label = reward.customLabel?.trim();
    return label && !INTERNAL_LABEL_PATTERN.test(label) ? label : unavailable.custom;
  }
  let label = reward.displayName?.trim();
  // Published TEST voucher names include a harness prefix and run date.
  // Strip those decorations only; keep the actual entitlement and its ID.
  if (reward.type === "VOUCHER" && /^UVEL\s+TEST\b/i.test(label ?? '')) {
    label = label!.replace(/^UVEL\s+TEST\b(?:\s+TEAM\d+(?=\s|$))?\s*/i, '')
      .replace(/(?:^|\s+)20\d{6}$/, '').trim();
  }
  return label || (reward.type === "VOUCHER" ? unavailable.voucher : unavailable.sku);
}
