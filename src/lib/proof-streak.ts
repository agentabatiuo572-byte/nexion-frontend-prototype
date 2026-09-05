export interface ProofStreakSource {
  currentStreak: number | null;
  longestStreak: number | null;
}

/** Keeps remote Proof streaks server-owned and never falls back to another local account. */
export function proofStreakFacts(
  remote: boolean,
  snapshot: ProofStreakSource | null,
  localCurrent: number,
  localLongest: number,
): { current: number | null; longest: number | null; display: number | null } {
  const current = remote ? snapshot?.currentStreak ?? null : localCurrent;
  const longest = remote ? snapshot?.longestStreak ?? null : localLongest;
  return { current, longest, display: longest ?? current ?? null };
}
