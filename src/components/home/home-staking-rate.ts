export interface HomeStakingPoolRate {
  apy: number;
  enabled: boolean;
  killed: boolean;
}

export function highestLiveStakingApyPct(pools: readonly HomeStakingPoolRate[]): number | null {
  const rates = pools
    .filter((pool) => pool.enabled && !pool.killed && Number.isFinite(pool.apy) && pool.apy >= 0)
    .map((pool) => pool.apy * 100);
  return rates.length > 0 ? Math.max(...rates) : null;
}
