import type { VRankDef } from '@/store/v-rank';

export const rankBenefitKeys = ['directBonus', 'unilevelDepth', 'peerBonus', 'leadershipVotes'] as const;
export type RankBenefitKey = typeof rankBenefitKeys[number];
type RankBenefits = Pick<VRankDef, 'v' | RankBenefitKey>;

/** Presentation only: compare published values, never infer an absent current tier.
 * Fall back to the full next tier if a value is unknown, unchanged throughout, or
 * reduced; an "improvements" summary must not conceal a reduction in benefits.
 */
export function increasedRankBenefitKeys(current: RankBenefits | null | undefined, next: RankBenefits | null | undefined): RankBenefitKey[] | null {
  if (!current || !next || next.v <= current.v) return null;
  const valid = (rank: RankBenefits, key: RankBenefitKey) => typeof rank[key] === 'number'
    && Number.isFinite(rank[key]) && rank[key] >= 0
    && (key !== 'unilevelDepth' && key !== 'leadershipVotes' || Number.isInteger(rank[key]));
  if (rankBenefitKeys.some(key => !valid(current, key) || !valid(next, key) || next[key] < current[key])) return null;
  const increased = rankBenefitKeys.filter(key => next[key] > current[key]);
  return increased.length ? increased : null;
}

export function rankBenefitIncreaseHeading(locale: string): string {
  return locale === 'zh' ? '新增／提升权益' : locale === 'vi' ? 'Quyền lợi mới hoặc nâng cao' : 'New or improved benefits';
}
