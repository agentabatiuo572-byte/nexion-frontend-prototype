import { formatDisplayDateTime } from "@/lib/display-date";
import type { AppHomeEarningsLedgerRow } from "@/api/app-home-api";

export interface CanonicalHomeActivityRow {
  id: string;
  client: string;
  model: string;
  rewardUsdt: number;
  completedAt: string;
}

export interface CanonicalHomeEarningsItem {
  id: string;
  client: string;
  model: string;
  amountUsdt: number;
  completedAt: string;
}

// Recent settlements may cross dates and years; retain the local calendar context.
export function formatHomeFeedTime(completedAt: string | null | undefined, locale: string): string {
  return formatDisplayDateTime(completedAt, locale);
}

export function buildCanonicalHomeFeed(
  ledger: readonly AppHomeEarningsLedgerRow[],
  limit = 6,
): { activityRows: CanonicalHomeActivityRow[]; earningsItems: CanonicalHomeEarningsItem[] } {
  const capped = ledger
    .slice()
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
    .slice(0, Math.max(0, limit));

  return {
    activityRows: capped.map((entry) => ({
      id: entry.id,
      client: entry.client,
      model: entry.model,
      rewardUsdt: entry.rewardUsdt,
      completedAt: entry.completedAt,
    })),
    earningsItems: capped.map((entry) => ({
      id: entry.id,
      client: entry.client,
      model: entry.model,
      amountUsdt: entry.rewardUsdt,
      completedAt: entry.completedAt,
    })),
  };
}
