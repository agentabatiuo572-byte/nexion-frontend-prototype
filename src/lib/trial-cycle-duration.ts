export function trialCycleDurationMs(startedAt: number | null, deadline: number | null, fallbackDays: number): number {
  return startedAt !== null && deadline !== null && deadline > startedAt
    ? deadline - startedAt
    : Math.max(1, fallbackDays) * 86_400_000;
}
