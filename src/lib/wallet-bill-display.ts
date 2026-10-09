import { fmt } from "@/i18n/format";

type DisplayBill = {
  memo: string;
  memoKey?: string;
  memoParams?: Record<string, string | number>;
  ref?: string;
  amount?: number;
};

/**
 * Server wallet rows carry a controlled presentation code. The stored ledger
 * remark remains an audit field and must never become user-facing fallback.
 */
export function resolveWalletBillMemo(bill: DisplayBill, memo: Record<string, string>, courseTitles: Record<string, string> = {}): string {
  // The canonical Bill amount already encodes IN/OUT; missing direction stays neutral.
  const memoKey = bill.memoKey === "refer"
    ? typeof bill.amount !== "number" || !Number.isFinite(bill.amount) || bill.amount === 0
      ? "referNeutral"
      : bill.amount < 0 ? "referDebit" : "refer"
    : bill.memoKey;
  const keyed = memoKey && Object.prototype.hasOwnProperty.call(memo, memoKey) ? memo[memoKey] : undefined;
  if (typeof keyed === "string" && keyed) {
    const label = bill.memoParams ? fmt(keyed, bill.memoParams) : keyed;
    const courseTitle = bill.memoKey === "learningReward" && bill.ref ? courseTitles[bill.ref] : undefined;
    return bill.memoKey === "learningReward" && bill.ref
      ? `${label} · ${courseTitle || bill.ref}`
      : label;
  }
  return memo.other ?? "Other ledger entry";
}
