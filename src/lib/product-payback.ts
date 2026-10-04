export function estimatePaybackDays(price: number, dailyEarn: number): number | null {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(dailyEarn) || dailyEarn <= 0) return null;
  const days = Math.round(price / dailyEarn);
  return Number.isFinite(days) ? days : null;
}