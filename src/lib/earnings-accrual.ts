const USD_ACCRUAL_DECIMALS = 3;
const USD_CENT_FACTOR = 100;

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Keep the device store's mill precision while accumulating into account totals.
 * UI components may still format to cents; the stored remainder must survive the
 * next tick instead of being rounded away on every pass.
 */
export function accumulateUsdAccrual(current: number, delta: number): number {
  const safeCurrent = finiteNonNegative(current);
  const safeDelta = finiteNonNegative(delta);
  return +(safeCurrent + safeDelta).toFixed(USD_ACCRUAL_DECIMALS);
}

/**
 * Release only newly completed cents to balance/bucket ledgers. The fractional
 * remainder stays in the aggregate and will be released by a later tick.
 */
export function completedUsdCentDelta(before: number, after: number): number {
  const beforeCents = Math.floor(finiteNonNegative(before) * USD_CENT_FACTOR + 1e-7);
  const afterCents = Math.floor(finiteNonNegative(after) * USD_CENT_FACTOR + 1e-7);
  return Math.max(0, afterCents - beforeCents) / USD_CENT_FACTOR;
}
