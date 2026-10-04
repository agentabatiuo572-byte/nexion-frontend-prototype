export interface ProfileVRankDefinition {
  v: number;
  title: string;
  cnTitle: string;
}

export interface ProfileVRankProjection {
  current: ProfileVRankDefinition;
  next: ProfileVRankDefinition | null;
}

/** A remote profile may display rank facts only after both canonical reads agree. */
export function profileVRankProjection(
  ready: boolean,
  rank: number,
  ladder: readonly ProfileVRankDefinition[],
): ProfileVRankProjection | null {
  if (!ready) return null;
  const current = ladder.find((item) => item.v === rank);
  if (!current) return null;
  return { current, next: ladder.find((item) => item.v === rank + 1) ?? null };
}
