import type { QuestSnapshot } from '@/api/quest-api';
import { dayOneClaimState } from '@/lib/day-one-claim-state';

/** A home summary is a read-only projection of the frozen newcomer instance. */
export function homeTaskSummary(snapshot: Pick<QuestSnapshot, 'quests' | 'dayOneRequiredTaskCount' | 'dayOneSnapshotStatus' | 'dayOneRewardNex'>, now: number) {
  const rows = snapshot.quests.filter(row => row.layer === 'DAY_ONE');
  const active = rows.filter(row => row.eligible && row.status !== 'CLAIMED' && row.status !== 'EXPIRED'
    && Date.parse(row.eligibleFrom) <= now && now < Date.parse(row.eligibleUntil));
  if (!active.length) return null;
  const claim = dayOneClaimState(rows, snapshot.dayOneRequiredTaskCount, snapshot.dayOneSnapshotStatus, now);
  const total = snapshot.dayOneRequiredTaskCount;
  const coherent = claim.verifiable && rows.length === total
    && new Set(rows.map(row => row.questCode)).size === total
    && new Set(rows.map(row => row.instanceKey)).size === 1;
  const remainingMs = Math.min(...active.map(row => Date.parse(row.eligibleUntil))) - now;
  return {
    done: coherent ? new Set(claim.completedCodes).size : null,
    total: coherent ? total : null,
    reward: coherent && snapshot.dayOneRewardNex > 0 ? snapshot.dayOneRewardNex : null,
    claimable: Boolean(claim.claimCode),
    // Avoid a perpetual urgency message: only the final day gets a countdown.
    remainingHours: remainingMs <= 86400000 && remainingMs > 3600000 ? Math.ceil(remainingMs / 3600000) : null,
    remainingMinutes: remainingMs <= 3600000 ? Math.max(1, Math.ceil(remainingMs / 60000)) : null,
  };
}
