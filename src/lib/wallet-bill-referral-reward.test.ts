import { computed, reactive, ref } from "vue";
import { expect, it } from "vitest";
import ts from "typescript";
import type { WalletBillRow } from "@/api/wallet-bills-api";
import type { Bill } from "@/store/bills";
import { resolveWalletBillMemo } from "./wallet-bill-display";
import store from "@/store/bills.ts?raw";
import wallet from "@/pages/me/wallet-bills.vue?raw";
import rewards from "@/pages/me/rewards-list.vue?raw";
import nex from "@/pages/me/wallet-nex.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";

function code(source: string, start: string, end: string): string {
  const first = source.indexOf(start);
  return ts.transpile(source.slice(first, source.indexOf(end, first)), { target: ts.ScriptTarget.ES2022 });
}
const project = new Function(code(store, "  function productionBill(", "  function refreshServerLedger(")
  + ";return productionBill;")() as (row: WalletBillRow) => Bill;
const reference = "REF-4D75281049274C0DA1521B30";
const languages = [
  ["zh", zh, ["新人礼", "邀请人奖励", "邀请奖励"]],
  ["en", en, ["Welcome gift", "Inviter reward", "Invitation reward"]],
  ["vi", vi, ["Quà chào mừng", "Thưởng người giới thiệu", "Thưởng lời mời"]],
] as const;
function row(overrides: Partial<WalletBillRow> = {}): WalletBillRow {
  return { id: "WL-597", bizNo: `${reference}:NEWCOMER`, bizType: "REFERRAL_REWARD", asset: "USDT",
    direction: "IN", amount: 0.015, amountExact: "0.015", balanceAfter: 0.015, balanceAfterExact: "0.015",
    status: "SUCCESS", createdAt: 1792195200000, remark: "PRIVATE RAW REMARK", ...overrides };
}

it.each(languages)("%s renders newcomer, inviter and generic rewards on all actual consumers with old and new projections", (_locale, messages, labels) => {
  const t = ref(messages);
  const walletTitle = new Function("t", code(wallet, "function typeLabel(", "function statusLabel(") + ";return typeLabel;")(t);
  const rewardTitle = new Function("t", code(rewards, "function rewardTypeLabel(", "function rewardStatusLabel(") + ";return rewardTypeLabel;")(t);
  for (const [suffix, memoKey, label] of [["NEWCOMER", "newcomerReward", labels[0]], ["INVITER", "inviterReward", labels[1]], ["UNKNOWN", "referralReward", labels[2]]]) {
    for (const asset of ["USDT", "UVT"] as const) {
      for (const projection of [{ category: "bonus", presentationCode: memoKey }, { category: "refer", presentationCode: "refer" }, { category: "bonus", presentationCode: "bonus" }, {}] as const) {
        const source = row({ bizNo: `${reference}:${suffix}`, asset, ...projection });
        const bill = project(source);
        expect(bill).toMatchObject({ id: source.id, type: "bonus", memoKey, memo: "", ref: undefined,
          amount: 0.015, amountExact: "0.015", balanceAfterExact: "0.015", symbol: asset, status: "posted", ledgerBizNo: source.bizNo });
        expect(walletTitle(bill.type)).toBe(messages.bills.typeBonus);
        expect(rewardTitle(bill.type)).toBe(messages.rewards.typeBonus);
        expect(resolveWalletBillMemo(bill, messages.bills.memo)).toBe(label);
        const records = ref([bill]);
        const rewardView = new Function("computed", "fundsServerEnabled", "records", "visibleCount", "t", "resolveWalletBillMemo", "courseTitles",
          code(rewards, "const visibleRecords = computed", "const hasMore = computed") + ";return visibleRecords;")(
          computed, true, records, ref(10), t, resolveWalletBillMemo, ref({}));
        expect(rewardView.value[0].memo).toBe(label);
        const bills = reactive({ summaryStatus: "ready", summary: { recentNexBills: [bill] } });
        const nexView = new Function("computed", "remoteApiEnabled", "bills", "t", "resolveWalletBillMemo", "summaryForDisplay",
          code(nex, "const nexLedger = computed", "const pendingNex = computed") + ";return nexLedger;")(
          computed, true, bills, t, resolveWalletBillMemo, computed(() => bills.summary));
        expect(nexView.value).toEqual(asset === "UVT" ? [{ id: bill.id, ts: bill.ts, kind: "ledger", nex: 0.015, label }] : []);
        expect(records.value[0].memo).toBe("");
        expect(label).not.toMatch(/PRIVATE|REF-|NEWCOMER|INVITER/);
      }
    }
  }
});

it.each(["NEWCOMER", "REF-123:NEWCOMER", `${reference}:NEWCOMER:EXTRA`, `${reference}:newcomer`, `SBX-${reference}:NEWCOMER`, ""])("does not infer a newcomer from an uncontrolled legacy reference %s", bizNo => {
  const bill = project(row({ bizNo, category: "refer", presentationCode: "refer", remark: "新用户邀请奖励" }));
  expect(bill).toMatchObject({ type: "bonus", memoKey: "referralReward", memo: "", ref: undefined });
});

it.each(languages)("%s keeps true commissions and signed reward status truthful", (_locale, messages, labels) => {
  for (const direction of ["IN", "OUT"] as const) {
    const commission = project(row({ bizType: "REFERRAL_COMMISSION", direction, category: "refer", presentationCode: "refer" }));
    expect(commission.type).toBe("refer");
    expect(resolveWalletBillMemo(commission, messages.bills.memo)).toBe(direction === "IN" ? messages.bills.memo.refer : messages.bills.memo.referDebit);
    for (const status of ["SUCCESS", "PENDING", "FAILED"] as const) {
      const gift = project(row({ direction, status, category: "bonus", presentationCode: "newcomerReward" }));
      expect(gift.amountExact).toBe(direction === "IN" ? "0.015" : "-0.015");
      expect(gift.status).toBe(status === "SUCCESS" ? "posted" : status === "PENDING" ? "pending" : "failed");
      expect(resolveWalletBillMemo(gift, messages.bills.memo)).toBe(labels[0]);
    }
  }
});
