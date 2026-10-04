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

// Native engines can ignore locale options; keep the device's local time compact.
export function formatHomeFeedTime(completedAt: string | null | undefined): string {
  const date = new Date(completedAt ?? "");
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
