import type { Bill } from "@/store/bills";

export type RewardsCat = "voucher" | "usdt" | "uvt" | "promotion";

function normalizedRewardsCat(value: string | null | undefined): RewardsCat | null {
  if (value === "nex") return "uvt"; // Historical navigation/cache entry only.
  return value === "voucher" || value === "usdt" || value === "uvt" || value === "promotion" ? value : null;
}

export function rewardsListCategory(options: Record<string, string> | undefined, queryString: string): RewardsCat {
  const fromQuery = new URLSearchParams(queryString).get("cat");
  return normalizedRewardsCat(options?.cat) ?? normalizedRewardsCat(fromQuery) ?? "voucher";
}

/** Only the server-projected course reference may become a learning deep link. */
export function courseRewardId(bill: Pick<Bill, "memoKey" | "ref">): string | null {
  if (bill.memoKey !== "learningReward") return null;
  const match = /^([a-z0-9][a-z0-9-]{2,80})@([A-Za-z0-9][A-Za-z0-9._-]{0,31})$/.exec(bill.ref ?? "");
  return match?.[1] ?? null;
}
