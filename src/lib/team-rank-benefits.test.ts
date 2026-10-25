import { describe, expect, it } from 'vitest';
import { increasedRankBenefitKeys, rankBenefitKeys } from './team-rank-benefits';

const current = { v: 2, directBonus: .1, unilevelDepth: 3, peerBonus: 0, leadershipVotes: 0 };
const next = { v: 3, directBonus: .1, unilevelDepth: 4, peerBonus: .05, leadershipVotes: 1 };
describe('rank benefit increments use complete published comparisons', () => {
  it('selects only actual increases without mutating the published tiers', () => {
    expect(increasedRankBenefitKeys(Object.freeze(current), Object.freeze(next)))
      .toEqual(['unilevelDepth', 'peerBonus', 'leadershipVotes']);
    expect(increasedRankBenefitKeys(current, { ...next, directBonus: .15 })).toEqual([...rankBenefitKeys]);
  });
  it('falls back to full next benefits for a missing current rank, unchanged benefits or a reduction', () => {
    expect(increasedRankBenefitKeys(undefined, next)).toBeNull();
    expect(increasedRankBenefitKeys(current, null)).toBeNull();
    expect(increasedRankBenefitKeys(current, { ...current, v: 3 })).toBeNull();
    expect(increasedRankBenefitKeys(current, { ...next, directBonus: .09 })).toBeNull();
    expect(increasedRankBenefitKeys(current, { ...next, v: 1 })).toBeNull();
  });
  it.each(rankBenefitKeys)('does not treat an unknown %s as zero', key => {
    for (const value of [undefined, null, NaN, Infinity, -1, '0']) {
      expect(increasedRankBenefitKeys({ ...current, [key]: value } as unknown as typeof current, next)).toBeNull();
      expect(increasedRankBenefitKeys(current, { ...next, [key]: value } as unknown as typeof next)).toBeNull();
    }
  });
  it('does not invent fractional levels or pool votes', () => {
    expect(increasedRankBenefitKeys(current, { ...next, unilevelDepth: 4.5 })).toBeNull();
    expect(increasedRankBenefitKeys(current, { ...next, leadershipVotes: 1.5 })).toBeNull();
  });
});
