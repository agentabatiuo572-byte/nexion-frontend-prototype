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
  votes: number;
  sharePct: number;
  isMine: boolean;
}

/** Main-table projection using only the authenticated server snapshot. */
export function leadershipMainRows(
  snapshot: LeadershipMainSnapshot,
  authenticatedRank: number,
  ranks: readonly number[],
): LeadershipMainVoteRow[] {
  const byRank = new Map(snapshot.distribution.map((row) => [row.vRank, row]));
  return ranks.map((rank) => {
    const row = byRank.get(rank);
    const people = row?.people ?? 0;
    const votes = row?.votes ?? 0;
    return {
      rank,
      people,
      votes,
      sharePct: snapshot.totalVotes > 0 ? ((people * votes) / snapshot.totalVotes) * 100 : 0,
      isMine: rank === authenticatedRank,
    };
  });
}
