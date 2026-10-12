import { formatAmount } from "./amount-display";
import { fmt } from "@/i18n/format";

type DisplayBill = {
  memo: string;
  memoKey?: string;
  memoParams?: Record<string, string | number>;
  ref?: string;
  amount?: number;
  amountExact?: string;
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
    const params = bill.memoParams && Object.fromEntries(Object.entries(bill.memoParams).map(([key, value]) => {
      const amount = key === "nex" && ["withdrawNexFee", "withdrawNexRefund"].includes(memoKey ?? "")
        ? bill.amountExact?.replace(/^-/, "") ?? (bill.amount === undefined ? value : Math.abs(bill.amount)) : value;
      return [key, ["amount", "nex", "usdt", "usd", "fee"].includes(key) ? formatAmount(amount) : value];
    }));
    const label = params ? fmt(keyed, params) : keyed;
    const courseTitle = bill.memoKey === "learningReward" && bill.ref ? courseTitles[bill.ref] : undefined;
    return bill.memoKey === "learningReward" && bill.ref
      ? `${label} · ${courseTitle || bill.ref}`
      : label;
  }
  return memo.other ?? "Other ledger entry";
}
