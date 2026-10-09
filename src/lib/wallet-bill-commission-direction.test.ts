import { describe, expect, it } from "vitest";
import { computed, reactive, ref } from "vue";
import ts from "typescript";
import { resolveWalletBillMemo } from "./wallet-bill-display";
import { parseWalletBillsSnapshot, type WalletBillRow } from "@/api/wallet-bills-api";
import type { Bill } from "@/store/bills";
import billsSource from "@/store/bills.ts?raw";
import walletSource from "@/pages/me/wallet-bills.vue?raw";
import nexSource from "@/pages/me/wallet-nex.vue?raw";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";

function code(source: string, start: string, end: string): string {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  if (first < 0 || last < 0) throw new Error("Controlled wallet projection binding missing");
  return ts.transpileModule(source.slice(first, last), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
const productionBill = new Function(code(billsSource, "  function productionBill(", "  function refreshServerLedger(")
  + ";return productionBill;")() as (row: WalletBillRow) => Bill;
const languages = [
  { locale: "en", messages: en, debit: "Referral commission debited", neutral: "Referral commission" },
  { locale: "vi", messages: vi, debit: "Hoa hồng giới thiệu đã khấu trừ", neutral: "Hoa hồng giới thiệu" },
  { locale: "zh", messages: zh, debit: "推荐分成扣减", neutral: "推荐分成" },
] as const;
function row(direction: "IN" | "OUT", asset: "USDT" | "NEX" = "USDT"): WalletBillRow {
  return { id: "WL-commission", bizNo: "PRIVATE-RECOVERY-KEY", bizType: "TEAM_COMMISSION", asset,
    direction, amount: 64.95, balanceAfter: 4216.78, status: "SUCCESS", remark: "PRIVATE-REMARK",
    createdAt: 1791356400000, category: "refer", presentationCode: "refer" };
}

describe("controlled referral commission direction", () => {
  it.each(languages)("retranslates IN and OUT through the actual wallet bill binding in $locale without changing ledger fields", ({ messages, debit }) => {
    const t = ref(messages);
    const billMemo = new Function("t", "resolveWalletBillMemo", "courseTitles",
      code(walletSource, "function billMemo(", "function toggleSourceRef(") + ";return billMemo;")(
      t, resolveWalletBillMemo, ref({}),
    ) as (bill: Bill) => string;
    for (const direction of ["IN", "OUT"] as const) {
      const bill = Object.freeze(productionBill(row(direction)));
      const before = { ...bill };
      expect(billMemo(bill)).toBe(direction === "OUT" ? debit : messages.bills.memo.refer);
      expect(bill).toEqual(before);
      expect(bill).toMatchObject({ id: "WL-commission", type: "refer", amount: direction === "OUT" ? -64.95 : 64.95,
        symbol: "USDT", status: "posted", ts: 1791356400000, memo: "", memoKey: "refer", balanceAfter: 4216.78 });
      expect(bill.ref).toBeUndefined();
      expect(billMemo(bill)).not.toMatch(/PRIVATE|RECOVERY|REMARK/);
    }
  });

  it.each(languages)("keeps NEX activity's signed amount while rendering the debit memo in $locale", ({ messages, debit }) => {
    const bill = productionBill(row("OUT", "NEX"));
    const bills = reactive({ summaryStatus: "ready", summary: { recentNexBills: [bill] } });
    const view = new Function("computed", "remoteApiEnabled", "bills", "t", "resolveWalletBillMemo",
      code(nexSource, "const nexLedger = computed", "const pendingNex = computed") + ";return nexLedger;")(
      computed, true, bills, ref(messages), resolveWalletBillMemo,
    ) as { value: Array<{ id: string; ts: number; nex: number; label: string }> };
    expect(view.value[0]).toMatchObject({ id: bill.id, ts: bill.ts, nex: -64.95, label: debit });
  });

  it.each(languages)("uses neutral controlled copy when signed direction is missing, invalid or zero in $locale", ({ messages, neutral }) => {
    for (const amount of [undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]) {
      expect(resolveWalletBillMemo({ memo: "PRIVATE-REMARK", memoKey: "refer", amount }, messages.bills.memo)).toBe(neutral);
    }
  });

  it.each(languages)("leaves every non-commission presentation unchanged in $locale", ({ messages }) => {
    for (const memoKey of ["earn", "bonus", "purchase", "orderRefund", "withdraw", "swap", "other"] as const) {
      for (const amount of [-64.95, 64.95, undefined]) {
        expect(resolveWalletBillMemo({ memo: "PRIVATE-REMARK", memoKey, amount }, messages.bills.memo)).toBe(messages.bills.memo[memoKey]);
      }
    }
    expect(resolveWalletBillMemo({ memo: "PRIVATE-REMARK", memoKey: "futureCode", amount: -64.95 }, messages.bills.memo)).toBe(messages.bills.memo.other);
  });

  it("keeps the existing protocol rejection for a server row missing direction rather than inventing a signed ledger amount", () => {
    const { direction: _missing, ...missingDirection } = row("OUT");
    expect(() => parseWalletBillsSnapshot({ source: "server", sourceEnvironment: "PRODUCTION", page: 1, pageSize: 50,
      total: 1, nextPage: null, nextCursor: null, bills: [{ ...missingDirection, createdAt: "2026-10-07T04:46:45Z" }],
    })).toThrow("WALLET_BILLS_RESPONSE_INVALID");
  });
});
