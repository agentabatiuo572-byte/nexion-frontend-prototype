import { highestLiveStakingApyPct, type HomeStakingPoolRate } from "@/components/home/home-staking-rate";

export function searchStakingRateSummary({
  remoteReady,
  pools,
  fallback,
  formatApy,
}: {
  remoteReady: boolean;
  pools: readonly HomeStakingPoolRate[];
  fallback: string;
  formatApy: (apy: number) => string;
}): string {
  const apy = remoteReady ? highestLiveStakingApyPct(pools) : null;
  return apy === null ? fallback : formatApy(apy);
}
