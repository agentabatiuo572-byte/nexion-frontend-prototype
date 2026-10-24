import type { LocalizedText, PublicPromotion, PublicRewardSpec, RewardDisclosure } from '@/api/promotion-contracts';

const text = (zh: string, en: string, vi: string): LocalizedText => ({ zh, en, vi });
/** Local scenarios use the source promotion-render fixtures (USDT 3/5, NEX 7)
 * and the published contract's one-device reward. SKU aliases map to this
 * prototype's existing catalog; these are demonstration seeds, not live policy. */
export function promotionSeeds(now = Date.now()): PublicPromotion[] {
  const terms = text('购买并完成付款后发放，退款时按奖励规则撤回。', 'Rewards follow completed payment and may be reversed after a refund.', 'Thưởng được cấp sau thanh toán và có thể bị thu hồi khi hoàn tiền.');
  const disclosure = (title: LocalizedText, device = false): RewardDisclosure => ({ title, terms, refundTerms: terms,
    benefitDescription: device ? text('赠送设备需在设备仓库激活，不可置换。', 'Activate the gift in your device inventory. Trade-in is unavailable.', 'Kích hoạt thiết bị tặng trong kho. Không hỗ trợ đổi máy.') : terms,
    deviceName: device ? 'Cloud Share' : null,
    deviceRights: device ? { activationMode: 'MANUAL', effectiveOn: 'ACTIVATED', durationDays: null, taskEnabled: true,
      countsAsDeviceHolding: true, countsForRank: false, transferable: false, exchangeable: false, revocationMode: 'REVOKE_IF_UNUSED' } : null });
  const reward = (id: string, type: 'DEVICE' | 'USDT' | 'NEX', amount: string, role: 'BUYER' | 'DIRECT_INVITER' = 'BUYER'): PublicRewardSpec => {
    const title = type === 'DEVICE' ? text('Cloud Share 赠礼', 'Cloud Share gift', 'Quà Cloud Share') : text('活动奖励', 'Promotion reward', 'Thưởng chương trình');
    return type === 'DEVICE' ? { rewardRuleId: id, beneficiaryRole: role, type, giftProductNo: 'cloud-share', quantity: 1, disclosure: disclosure(title, true) }
      : { rewardRuleId: id, beneficiaryRole: role, type, calculation: 'FIXED', amount, disclosure: disclosure(title) };
  };
  return [
    { id: 'purchase-gift', template: 'SKU_GIFT' as const, title: text('购机赠礼', 'Purchase gifts', 'Mua máy nhận quà'), buyer: reward('gift-device', 'DEVICE', '1'), inviter: null },
    { id: 'first-purchase', template: 'FIRST_PURCHASE' as const, title: text('首购奖励', 'First purchase reward', 'Thưởng mua lần đầu'), buyer: reward('first-usdt', 'USDT', '5.000000'), inviter: null },
    { id: 'invite-first-purchase', template: 'DIRECT_REFERRAL' as const, title: text('邀请好友首购', 'Invite a first purchase', 'Mời bạn mua lần đầu'), buyer: reward('invite-buyer', 'USDT', '3.000000'), inviter: reward('invite-nex', 'NEX', '7.000000', 'DIRECT_INVITER') },
  ].map((entry) => ({ activityId: entry.id, version: 1, template: entry.template, state: 'ACTIVE',
    startsAt: new Date(now - 86400000).toISOString(), endsAt: new Date(now + 30 * 86400000).toISOString(), serverTime: new Date(now).toISOString(),
    title: entry.title, terms, placement: 'home.purchase-promotion', target: 'STORE', productNos: ['stellarbox-s1', 'cloud-share'],
    minimumClientCapabilities: ['PROMOTION_QUOTE_V1', 'ORDER_ITEM_QUANTITIES_V1', 'PROMOTION_REWARDS_V1'], eligibility: 'ESTIMATE_ELIGIBLE', eligibilityMessage: null,
    rewardRules: ['stellarbox-s1', 'cloud-share'].map(productNo => ({ ruleId: entry.id + ':' + productNo, productNo, minBuyQty: entry.template === 'SKU_GIFT' ? 2 : 1,
      repeatMode: entry.template === 'SKU_GIFT' ? 'PER_GROUP' : 'ONCE_PER_ORDER', maxGroups: { mode: 'UNLIMITED' }, maxGroupsPerPerson: { mode: 'UNLIMITED' },
      buyerReward: entry.buyer, inviterReward: entry.inviter })) }));
}
