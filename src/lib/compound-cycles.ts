/** The first term is the initial stake; only later terms are re-investments. */
export function reinvestmentCount(totalCycles: number): number {
  return Math.max(0, Math.floor(totalCycles) - 1);
}

/** A compound projection only covers complete staking terms in its stated year. */
export function compoundDurationDays(termDays: number, horizonDays = 365): number {
  if (!Number.isFinite(termDays) || termDays <= 0 || !Number.isFinite(horizonDays) || horizonDays <= 0) return 0;
  return Math.floor(horizonDays / termDays) * termDays;
}
