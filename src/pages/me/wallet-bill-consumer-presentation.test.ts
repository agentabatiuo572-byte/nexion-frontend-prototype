// @ts-expect-error This behavior test reads SFC source in Node.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { computed, reactive, ref } from "vue";
import { describe, expect, it } from "vitest";
import { resolveWalletBillMemo } from "@/lib/wallet-bill-display";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";

function section(file: string, start: string, end: string): string {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  if (first < 0 || last < 0) throw new Error(`Missing display binding in ${file}`);
  return ts.transpile(source.slice(first, last), { target: ts.ScriptTarget.ES2022 });
}
const row = (memoKey = "questReward") => ({ id: "ledger-1", ts: 1, symbol: "NEX", amount: 5,
  status: "posted", type: "achievement", memo: "", memoKey, ref: undefined as string | undefined });

function nexView(memoKey?: string) {
  const bills = reactive({ summaryStatus: "ready", summary: { recentNexBills: [row(memoKey)] } });
  const t = ref(en);
  const code = section("./wallet-nex.vue", "const nexLedger = computed", "const pendingNex = computed");
  const view = new Function("computed", "remoteApiEnabled", "bills", "t", "resolveWalletBillMemo",
    `${code}; return nexLedger;`)(computed, true, bills, t, resolveWalletBillMemo);
  return { bills, t, view };
}
function rewardsView(memoKey?: string) {
  const records = ref([row(memoKey)]);
  const t = ref(en);
  const courseTitles = ref<Record<string, string>>({});
  const code = section("./rewards-list.vue", "const visibleRecords = computed", "const hasMore = computed");
  const view = new Function("computed", "fundsServerEnabled", "records", "visibleCount", "t", "resolveWalletBillMemo", "courseTitles",
    `${code}; return visibleRecords;`)(computed, true, records, ref(10), t, resolveWalletBillMemo, courseTitles);
  return { records, t, courseTitles, view };
}

describe("controlled wallet descriptions on every consumer", () => {
  it("retranslates a read-only order refund on the wallet bill page", () => {
    const t = ref(en);
    const labelCode = section("./wallet-bills.vue", "function typeLabel(", "function statusLabel(");
    const typeLabel = new Function("t", `${labelCode}; return typeLabel;`)(t);
    const clickCode = section("./wallet-bills.vue", "function billClickable(", "function billRowOn(");
    const billClickable = new Function("txParamsForTopup", `${clickCode}; return billClickable;`)(() => {
      throw new Error("A refund must not route to a chain transaction");
    });
    const refund = { ...row("orderRefund"), type: "refund", symbol: "USDT", amount: 1299,
      ref: "ORD-8EB83D7802F0458DA6CD797F2D99A746" };
    const rendered = computed(() => `${typeLabel(refund.type)} · ${resolveWalletBillMemo(refund, t.value.bills.memo)} · ${refund.ref}`);
    for (const [messages, expected] of [[en, "Refund · Order refund"], [vi, "Hoàn tiền · Hoàn tiền đơn hàng"], [zh, "退款 · 订单退款"]] as const) {
      t.value = messages;
      expect(rendered.value).toBe(`${expected} · ${refund.ref}`);
      expect(billClickable(refund)).toBe(false);
    }
    expect(refund.memo).toBe("");
  });
  it("renders and retranslates NEX activity without exposing the internal category", () => {
    const s = nexView();
    expect(s.view.value[0].label).toBe(en.bills.memo.questReward);
    s.t.value = zh;
    expect(s.view.value[0].label).toBe(zh.bills.memo.questReward);
    expect(s.bills.summary.recentNexBills[0].memo).toBe("");
  });
  it("does not display NEX activity from a failed summary", () => {
    const s = nexView(); s.bills.summaryStatus = "error";
    expect(s.view.value).toEqual([]);
  });
  it("renders and retranslates reward rows without mutating ledger records", () => {
    const s = rewardsView();
    expect(s.view.value[0].memo).toBe(en.bills.memo.questReward);
    s.t.value = zh;
    expect(s.view.value[0].memo).toBe(zh.bills.memo.questReward);
    expect(s.records.value[0].memo).toBe("");
  });
  it("keeps unknown NEX and reward descriptions generic", () => {
    expect(nexView("futureCode").view.value[0].label).toBe(en.bills.memo.other);
    expect(rewardsView("futureCode").view.value[0].memo).toBe(en.bills.memo.other);
  });
  it("distinguishes same-day course rewards by their course reference", () => {
    const s = rewardsView("learningReward");
    s.records.value[0].ref = "nexgrid-account-safety-202609@v1";
    expect(s.view.value[0].memo).toBe(`${en.bills.memo.learningReward} · nexgrid-account-safety-202609@v1`);
    s.courseTitles.value = { "nexgrid-account-safety-202609@v2": "Wrong version" };
    expect(s.view.value[0].memo).toBe(`${en.bills.memo.learningReward} · nexgrid-account-safety-202609@v1`);
    s.courseTitles.value = { "nexgrid-account-safety-202609@v1": "Account safety: recognize risks" };
    expect(s.view.value[0].memo).toBe(`${en.bills.memo.learningReward} · Account safety: recognize risks`);
    s.t.value = zh;
    s.courseTitles.value = { "nexgrid-account-safety-202609@v1": "账户安全：识别风险与寻求帮助" };
    expect(s.view.value[0].memo).toBe(`${zh.bills.memo.learningReward} · 账户安全：识别风险与寻求帮助`);
    expect(s.records.value[0].ref).toBe("nexgrid-account-safety-202609@v1");
    expect(zh.bills.memo.learningReward).not.toBe(zh.bills.memo.bonus);
    expect(en.bills.memo.learningReward).not.toBe(en.bills.memo.bonus);
  });
});
