export interface LeadershipHowSnapshot {
  injectRate: number;
  unlockRank: number;
  nextPayoutAt: string;
  distribution: readonly { vRank: number }[];
}

/** Public F4 facts allowed in the instructional page. */
export function leadershipHowFacts(snapshot: LeadershipHowSnapshot) {
  return {
    unlockRank: snapshot.unlockRank,
    injectRatePct: snapshot.injectRate * 100,
    nextPayoutAt: snapshot.nextPayoutAt,
  };
}

/** Configured ranks remain visible even before anyone participates. */
export function leadershipHowRanks(snapshot: LeadershipHowSnapshot, configuredRanks: readonly number[]): number[] {
  return [...new Set(configuredRanks.filter((rank) => rank >= snapshot.unlockRank))].sort((left, right) => left - right);
}
