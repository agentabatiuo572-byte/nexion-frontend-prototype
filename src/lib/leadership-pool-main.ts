export interface LeadershipDistributionFact {
  vRank: number;
  people: number;
  votes: number;
}

export interface LeadershipMainSnapshot {
  totalVotes: number;
  distribution: readonly LeadershipDistributionFact[];
}

export interface LeadershipMainVoteRow {
  rank: number;
  people: number;
  votes: number | null;
  sharePct: number;
  isMine: boolean;
}

/** Main-table projection using only the authenticated server snapshot. */
export function leadershipMainRows(
  snapshot: LeadershipMainSnapshot,
  authenticatedRank: number,
  ranks: readonly number[],
  configuredVotes: ReadonlyMap<number, number>,
): LeadershipMainVoteRow[] {
  const byRank = new Map(snapshot.distribution.map((row) => [row.vRank, row]));
  return ranks.map((rank) => {
    const row = byRank.get(rank);
    const people = row?.people ?? 0;
    const votes = row?.votes ?? configuredVotes.get(rank) ?? null;
    return {
      rank,
      people,
      votes,
      sharePct: snapshot.totalVotes > 0 && row ? ((people * row.votes) / snapshot.totalVotes) * 100 : 0,
      isMine: rank === authenticatedRank,
    };
  });
}
