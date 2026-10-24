import type { ExpectedReward, Item, PublicPromotion, Quote, RewardSpec } from '@/api/promotion-contracts';
import { validEntryItems } from '@/lib/promotion-entry';

export function buildPromotionQuote(input: { items: Item[]; activity: PublicPromotion; prices: Record<string, number>; firstPurchase: boolean; invited: boolean; usedGroups: Record<string, number>; now: number; id: string; discount?: number }): Quote {
  const { items, activity, prices, now, id } = input;
  if (!validEntryItems(items)) throw new Error('selection');
  if (activity.state !== 'ACTIVE' || now < Date.parse(activity.startsAt) || now >= Date.parse(activity.endsAt)) throw new Error('unavailable');
  if ((activity.template === 'FIRST_PURCHASE' || activity.template === 'DIRECT_REFERRAL') && !input.firstPurchase) throw new Error('ineligible');
  if (activity.template === 'DIRECT_REFERRAL' && !input.invited) throw new Error('inviteRequired');
  const lines = items.map((item, index) => {
    const price = prices[item.productNo];
    if (!activity.productNos.includes(item.productNo) || !Number.isFinite(price) || price <= 0) throw new Error('unavailable');
    return { lineId: id + ':' + index, ...item, unitPriceUsdt: price.toFixed(6), subtotalUsdt: (price * item.quantity).toFixed(6), discountUsdt: '0.000000', payableUsdt: (price * item.quantity).toFixed(6) };
  });
  const subtotal = lines.reduce((sum, line) => sum + Number(line.subtotalUsdt), 0);
  if (input.discount !== undefined && (!Number.isFinite(input.discount) || input.discount < 0)) throw new Error('voucher');
  const discount = Math.max(0, Math.min(input.discount ?? 0, subtotal));
  if (discount && lines.length !== 1) throw new Error('voucher');
  if (discount) { lines[0].discountUsdt = discount.toFixed(6); lines[0].payableUsdt = (subtotal - discount).toFixed(6); }
  const expectedRewards: ExpectedReward[] = [];
  for (const line of lines) for (const rule of activity.rewardRules.filter(r => r.productNo === line.productNo)) {
    let groups = rule.repeatMode === 'ONCE_PER_ORDER' ? (line.quantity >= rule.minBuyQty ? 1 : 0) : Math.floor(line.quantity / rule.minBuyQty);
    if (rule.maxGroups.mode === 'LIMITED') groups = Math.min(groups, rule.maxGroups.value);
    if (rule.maxGroupsPerPerson.mode === 'LIMITED') groups = Math.min(groups, Math.max(0, rule.maxGroupsPerPerson.value - (input.usedGroups[rule.ruleId] ?? 0)));
    if (!groups) continue;
    for (const spec of [rule.buyerReward, rule.inviterReward].filter(Boolean)) {
      if (!spec) continue;
      const reward: RewardSpec = spec.type === 'DEVICE' ? { ...spec, deviceRightsProfile: { policyId: spec.rewardRuleId, version: activity.version, contentHash: spec.rewardRuleId } }
        : { ...spec, assetPolicy: { policyId: spec.rewardRuleId, version: activity.version, contentHash: spec.rewardRuleId } };
      expectedRewards.push({ lineId: line.lineId, activityId: activity.activityId, version: activity.version, ruleId: rule.ruleId, rewardRuleId: spec.rewardRuleId, beneficiaryRole: spec.beneficiaryRole,
        groups, reward, eligibility: 'ELIGIBLE', message: null, disclosure: spec.disclosure });
    }
  }
  if (!expectedRewards.length) throw new Error('ineligible');
  return { quoteId: id, quoteHash: JSON.stringify([items, activity.activityId, activity.version, discount]), expiresAt: new Date(now + 5 * 60000).toISOString(), serverTime: new Date(now).toISOString(),
    itemCount: items.length, quantity: items.reduce((n, item) => n + item.quantity, 0), items: lines, subtotalUsdt: subtotal.toFixed(6), discountUsdt: discount.toFixed(6), amountUsdt: (subtotal - discount).toFixed(6),
    bundlePolicyVersion: 1, activityId: activity.activityId, activityVersion: activity.version, eligibility: 'ELIGIBLE', expectedRewards, warnings: [], reserved: false };
}
