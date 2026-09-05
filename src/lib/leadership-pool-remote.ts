export interface RemoteLeadershipDistribution {
  vRank: number;
  people: number;
  votes: number;
}

export interface RemoteLeadershipPoolProjection {
  totalVotes: number;
  distribution: readonly RemoteLeadershipDistribution[];
}

export interface LeadershipHowVoteRow {
  rank: number;
  votes: number | null;
  sharePct: number | null;
}

/** Derives the explanation table solely from the canonical pool snapshot. */
export function leadershipHowRows(
  snapshot: RemoteLeadershipPoolProjection,
  ranks: readonly number[],
): LeadershipHowVoteRow[] {
  const byRank = new Map(snapshot.distribution.map((row) => [row.vRank, row]));
  return ranks.map((rank) => {
    const row = byRank.get(rank);
    const votes = row?.votes ?? null;
    return {
      rank,
      votes,
      sharePct: votes !== null && snapshot.totalVotes > 0 ? (votes / snapshot.totalVotes) * 100 : null,
    };
  });
}
