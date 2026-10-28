import type { RankGap, VRankConditions, VRankData, VRankDef } from '@/store/v-rank';

export interface RankRequirement {
  tier: number;
  key: string;
  kind: RankGap['kind'];
  conditions: VRankConditions;
  current: number | undefined;
  required: number;
  vLevel?: number;
  status: 'met' | 'missing' | 'unknown';
  gap: RankGap | null;
}
const known = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Display projection only. Never recalculates or writes the protected current rank. */
export function teamRankRequirements(state: VRankData, ladder: readonly VRankDef[]) {
  const next = ladder.find(rank => rank.v > state.myRank);
  const rows: RankRequirement[] = [];
  if (next) for (const rank of ladder.filter(rank => rank.v <= next.v)) {
    const c = rank.conditions;
    const add = (kind: RankGap['kind'], current: number | undefined, required: number, conditions: VRankConditions, vLevel?: number) => {
      const status = !known(current) || !known(required) ? 'unknown' : current >= required ? 'met' : 'missing';
      const remaining = status === 'missing' ? required - current! : 0;
      const gap: RankGap | null = status !== 'missing' ? null
        : kind === 'directRefs' ? { kind, n: remaining }
        : kind === 'vDownlines' ? { kind, n: remaining, vLevel: vLevel! }
        : { kind, amount: remaining };
      rows.push({ tier: rank.v, key: `${rank.v}-${kind}-${vLevel ?? ''}`, kind, current, required, conditions, vLevel, status, gap });
    };
    if (c.selfComputePoints !== undefined) add('selfComputePoints', state.selfComputePoints, c.selfComputePoints, { selfComputePoints: c.selfComputePoints });
    if (c.directRefs) add('directRefs', state.directRefs, c.directRefs, { directRefs: c.directRefs });
    if (c.teamComputePoints !== undefined) add('teamComputePoints', state.teamComputePoints, c.teamComputePoints, { teamComputePoints: c.teamComputePoints });
    for (const [level, required] of Object.entries(c.vDownlines ?? {})) {
      if (required) add('vDownlines', state.vDownlineCounts[Number(level)] ?? 0, required, { vDownlines: { [level]: required } }, Number(level));
    }
  }
  return { next: next ?? null, rows, missing: rows.filter(row => row.status === 'missing'), unknown: rows.filter(row => row.status === 'unknown') };
}
