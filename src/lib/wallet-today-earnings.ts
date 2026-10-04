export type HomeTruthStatus = "idle" | "loading" | "ready" | "error";

export interface WalletTodayEarningsInput {
  remoteApiEnabled: boolean;
  homeTruthStatus: HomeTruthStatus;
  homeTodayUsdt: number | null;
  localTodayUsdt: number;
}

/**
 * The Home projection is the sole server authority for today's earnings.
 * A stale or unavailable projection must remain unknown rather than borrowing
 * a wallet's pending-earnings bucket.
 */
export function resolveWalletTodayEarnings(input: WalletTodayEarningsInput): number | null {
  if (!input.remoteApiEnabled) return Number.isFinite(input.localTodayUsdt) ? input.localTodayUsdt : null;
  if (input.homeTruthStatus !== "ready" || input.homeTodayUsdt === null) return null;
  return Number.isFinite(input.homeTodayUsdt) ? input.homeTodayUsdt : null;
}
