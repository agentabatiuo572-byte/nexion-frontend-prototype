/** G1 percentage parameters retain up to six decimal places. Input is a ratio. */
export function formatStakingPercentage(rate: number): string {
  return Number.isFinite(rate) ? String(Number((rate * 100).toFixed(6))) : '—';
}
