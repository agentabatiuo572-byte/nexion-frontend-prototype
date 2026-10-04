import { fmt } from "@/i18n/format";

type DisplayBill = {
  memo: string;
  memoKey?: string;
  memoParams?: Record<string, string | number>;
  ref?: string;
};

/**
 * Server wallet rows carry a controlled presentation code. The stored ledger
 * remark remains an audit field and must never become user-facing fallback.
 */
export function resolveWalletBillMemo(bill: DisplayBill, memo: Record<string, string>, courseTitles: Record<string, string> = {}): string {
  const keyed = bill.memoKey && Object.prototype.hasOwnProperty.call(memo, bill.memoKey) ? memo[bill.memoKey] : undefined;
  if (typeof keyed === "string" && keyed) {
    const label = bill.memoParams ? fmt(keyed, bill.memoParams) : keyed;
    const courseTitle = bill.memoKey === "learningReward" && bill.ref ? courseTitles[bill.ref] : undefined;
    return bill.memoKey === "learningReward" && bill.ref
      ? `${label} · ${courseTitle || bill.ref}`
      : label;
  }
  return memo.other ?? "Other ledger entry";
}
