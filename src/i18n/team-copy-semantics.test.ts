import { describe, expect, it } from 'vitest';
import { zh } from './messages/zh';
import { en } from './messages/en';
import { vi } from './messages/vi';
import { fmt } from './format';
import { teamRedesignCopy } from './team-redesign';

describe('team copy distinguishes reward mechanisms', () => {
  it.each(Object.entries({ zh, en, vi }))('%s keeps totals, invitations and other reward sources distinct', (locale, messages) => {
    const copy = teamRedesignCopy(locale);
    expect(new Set([copy.teamIncome, copy.teamRewards, copy.invitationRewards, copy.twoGroupRewards, copy.memberGrowthReward]).size).toBe(5);
    expect(messages.directReferral.title).toBe(copy.teamRewards);
    expect(messages.headerTitles.teamUnilevel).toBe(copy.teamRewards);
    expect(messages.binary.pageTitle).toBe(copy.twoGroupRewards);
    expect(messages.commissions.kind.binary).toBe(copy.twoGroupRewards);
    expect(messages.pool.pageTitle).toBe(copy.teamIncentivePool);
    expect(messages.commissions.kind.cultivation).toBe(copy.memberGrowthReward);
    expect(messages.tree.pageTitle).toBe(copy.memberRelationships);
    expect(messages.team.earnForEachFriend).toBe(copy.qualifiedFriendReward);
    expect(messages.teamV3.royaltyHeroLabel).not.toBe(copy.teamRewards);
    expect(messages.team.summaryDirect).not.toBe(messages.teamV3.extendedLabel);
  });

  it.each(Object.entries({ zh, en, vi }))('%s preserves computed rates, caps and cadence without inventing a payout', (_locale, messages) => {
    const rendered = fmt(messages.binary.formula, { rate: '7.125', cap: '0', freq: messages.binary.settlePeriodLabel.weekly });
    expect(rendered).toContain('7.125%');
    expect(rendered).toContain('$0');
    expect(rendered).toContain(messages.binary.settlePeriodLabel.weekly);
    expect(rendered).not.toMatch(/\{\w+\}/);
    expect(messages.binary.formula).toMatch(/算力点用于对比两组贡献|Compute points compare the two groups|Điểm tính toán dùng để so sánh đóng góp của hai nhóm/);
    expect(messages.binary.formula).not.toMatch(/点\s*[×x*]|points\s*[×x*]/i);
    expect(messages.rank.networkDepth).toContain('{n}');
    expect(messages.directReferral.purchaseSplitRule).toContain('{usdt}%');
    expect(messages.directReferral.purchaseSplitRule).toContain('{nex}%');
    expect(messages.directReferral.platformPays).toMatch(/直接邀请|directly invited|mời trực tiếp/);
    expect(messages.rank.cultivationRecipient).toMatch(/无推荐人|no sponsor|không có người giới thiệu/);
  });

  it.each(Object.entries({ zh, en, vi }))('%s retains settled facts separately from prospective estimates', (_locale, messages) => {
    for (const text of [messages.team.settledToWallet, messages.directReferral.creditedTotal, messages.teamV3.settled]) {
      expect(text).not.toMatch(/预估|预计|estimate|ước tính|dự kiến/i);
    }
    expect(messages.binary.estimate).toMatch(/预估|estimate|ước tính/i);
    expect(messages.directReferral.netHint).toMatch(/冲正|冲回|reversed|thu hồi/i);
    expect(Object.keys(messages.commissions.kind)).toEqual(expect.arrayContaining(['direct_purchase', 'direct_device_earning', 'unilevel', 'binary', 'cultivation', 'leadership']));
  });

  it.each(Object.entries({ zh, en, vi }))('%s removes unsupported social proof without removing live counts or cancellation', (_locale, messages) => {
    expect([messages.team.earnedTodayCount, messages.team.topPercent, messages.team.invitePromoChip].join(' ')).not.toMatch(/247|1\.2%|限时|本周|limited time|this week|có hạn|tuần này/i);
    expect(messages.team.invitePromoChip).toContain('{multiplier}');
    expect(messages.store.liveProof.stockWarning).toContain('{n}');
    expect(messages.genesis.tier.left).toContain('{n}');
    expect(messages.team.inviteShareText).toContain('{url}');
    expect(messages.team.inviteShareText).not.toMatch(/200|passive income|被动收益|thu nhập thụ động/i);
    expect(messages.promotion.leaveBody).not.toMatch(/限时|limited time|có thời hạn/i);
    expect(messages.promotion.cancelOrder).toMatch(/取消订单|Cancel order|Hủy đơn hàng/);
    expect(messages.store.coCancel).toMatch(/取消|Cancel|Hủy/);
    expect(messages.store.coEstPayback).toContain('{roi}%');
    expect(messages.store.coEstPayback).toContain('{days}');
  });

  it('provides every approved compact-card label with locale fallback', () => {
    const keys = ['inviteFriends', 'qualifiedFriendReward', 'rewardRecords', 'myTeam', 'members', 'directInvites', 'myRank', 'currentRank', 'promotionRequirements', 'benefitsAndRewards', 'rules', 'inviteRules', 'inviteRuleSummary', 'inviteRuleSettlement', 'recentRewards', 'settled', 'pending', 'totalEarned', 'latestRecords', 'viewProgress', 'firstPurchase', 'firstPurchaseCount', 'orderUnit'] as const;
    for (const locale of ['zh', 'en', 'vi']) for (const key of keys) expect(teamRedesignCopy(locale)[key].trim()).not.toBe('');
    expect(teamRedesignCopy('VI-vn')).toBe(teamRedesignCopy('vi'));
    expect(teamRedesignCopy('zh_CN')).toBe(teamRedesignCopy('zh'));
    expect(teamRedesignCopy('unknown')).toBe(teamRedesignCopy('en'));
  });

  it.each(Object.entries({ zh, en, vi }))('%s does not infer invitation cooling days or purchase eligibility from unavailable fields', (locale, messages) => {
    const copy = teamRedesignCopy(locale);
    expect([copy.inviteRuleSummary, copy.inviteRuleSettlement, messages.team.perFriendCooldown].join(' ')).not.toMatch(/30|冷却|cooling|cooldown|chờ \d/i);
    expect(copy.inviteRuleSummary).toMatch(/条件|conditions|điều kiện/i);
    expect(copy.inviteRuleSettlement).toMatch(/奖励记录|reward records|bản ghi thưởng/);
    expect(copy.settled).not.toMatch(/预估|estimate|ước tính/i);
    expect(copy.pending).not.toBe(copy.settled);
    expect(copy.estimated).toMatch(/预估|Estimated|Ước tính/);
    expect(copy.estimated).not.toBe(copy.settled);
  });
});
