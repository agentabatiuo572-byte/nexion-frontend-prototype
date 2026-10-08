import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./wallet-bills.vue?raw";
import { parseWalletBillsSnapshot } from "@/api/wallet-bills-api";
import { formatHowNumber } from "@/lib/rank-how-content";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import type { Bill } from "@/store/bills";

const { descriptor } = parse(source, { filename: "wallet-bills.vue" });
const script = compileScript(descriptor, { id: "wallet-bills-precision", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" || tag === "text" } } });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const dicts = { en, zh, vi: vietnamese };
async function render(locale: keyof typeof dicts, rows: Bill[], ledgerBizNo = "") {
  const pager = Vue.reactive({ rows, status: "ready", hasMore: false, loadingMore: false, error: "", refresh: vi.fn(), loadMore: vi.fn() });
  const empty = Vue.defineComponent(() => () => null);
  const chassis = Vue.defineComponent({ setup: (_props, { slots }) => () => Vue.h("main", slots.default?.()) });
  const modules: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onLoad: (fn: (options: { ledgerBizNo: string }) => void) => fn({ ledgerBizNo }), onShow: vi.fn(), onHide: vi.fn() },
    "@/components/app-chassis.vue": { default: chassis }, "@/components/empty-state.vue": { default: empty },
    "@/components/sub-page-header.vue": { default: empty }, "@/components/me/bill-type-icon.vue": { default: empty },
    "@/components/glass-segments.vue": { default: Vue.defineComponent(() => () => Vue.h("view", { "data-bill-tabs": "true" })) }, "@/i18n/use-t": { useT: () => Vue.ref(dicts[locale]) },
    "@/i18n/format": { dateLocale: () => locale, fmt: (text: string) => text },
    "@/lib/wallet-bill-date": { walletBillMonthKey: () => "2026-10", walletBillMonthLabel: () => "October", walletBillTimeLabel: () => "12:00" },
    "@/lib/wallet-bill-display": { resolveWalletBillMemo: () => "Reward" }, "@/lib/rank-how-content": { formatHowNumber },
    "@/composables/use-course-reward-titles": { useCourseRewardTitles: () => Vue.ref({}) },
    "@/store/bills": { useBills: () => ({ bills: rows, getLedger: () => pager }) },
    "@/store/app": { useApp: () => ({ accountBindingEpoch: 1, accountKey: "user:7" }) },
    "@/store/auth": { useAuth: () => ({ isAuthenticated: true, accountId: 7 }) },
    "@/store/deposits": { useDeposits: () => ({ records: [] }), CHAIN_NET_SHORT: {} },
    "@/store/server-time": { mockServerNow: () => 1 }, "@/lib/route": { navTo: vi.fn(), takeNavigationQuery: () => "" },
    "@/api/runtime": { fundsServerEnabled: true, sessionVault: { read: () => ({ user: { userId: 7 } }) } },
    "@/lib/binary-session-ready": { binarySessionReady: () => true },
    "@/composables/use-manual-scroll-load-more": { useManualScrollLoadMore: vi.fn() },
  };
  const module = { exports: {} as { default: Vue.Component } };
  new Function("require", "module", "exports", code)((name: string) => {
    if (!(name in modules)) throw new Error(`Unmapped SFC dependency: ${name}`);
    return modules[name];
  }, module, module.exports);
  return renderToString(Vue.createSSRApp(module.exports.default));
}
const fixture = (exact: string, symbol: Bill["symbol"], debit = false): Bill => ({
  id: `${symbol}-${exact}-${debit}`, type: "bonus", amount: Number(exact) * (debit ? -1 : 1),
  amountExact: `${debit ? "-" : ""}${exact}`, balanceAfter: Number(exact), balanceAfterExact: exact,
  symbol, status: "posted", ts: 1, memo: "", memoKey: "bonus",
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("wallet bills exact money render", () => {
  it.each(["en", "zh", "vi"] as const)("renders only the requested receipt and hides unrelated filters in %s", async locale => {
    const matching = { ...fixture("0.000001", "NEX"), ledgerBizNo: "R1:exact" };
    const other = { ...fixture("999999999999.999999", "USDT"), ledgerBizNo: "R1:exact-REV", ref: "R1:exact" };
    const html = await render(locale, [matching, other], "R1:exact");
    expect(html).toContain(locale === "vi" ? "+0,000001" : "+0.000001");
    expect(html).not.toContain("999,999,999,999"); expect(html).not.toContain("999.999.999.999");
    expect(html).not.toContain("R1:exact"); expect(html).not.toContain("data-bill-tabs");
    expect(await render(locale, [matching])).toContain("data-bill-tabs");
  });
  it.each(["en", "zh", "vi"] as const)("renders both assets, directions and balances without losing digits in %s", async locale => {
    vi.stubGlobal("Intl", undefined);
    const native = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(() => { throw new Error("Native localization unavailable"); });
    for (const symbol of ["USDT", "NEX"] as const) {
      for (const exact of ["0.000001", "1.000001", "999999999999.999999"]) {
        const formatted = locale === "vi" ? exact.replace(/\B(?=(\d{3})+\.)/g, ".").replace(/\.(\d{6})$/, ",$1")
          : exact.replace(/\B(?=(\d{3})+\.)/g, ",");
        for (const debit of [false, true]) {
          const html = await render(locale, [fixture(exact, symbol, debit)]);
          expect(html).toContain(`${debit ? "-" : "+"}${formatted}`);
          if (symbol === "USDT") expect(html).toContain(`${dicts[locale].bills.runningBalance}: ${formatted}`);
        }
      }
    }
    expect(native).not.toHaveBeenCalled();
  });
  it("renders a number-only older server at six decimal places without inventing lost digits", async () => {
    const row = parseWalletBillsSnapshot({ source: "server", sourceEnvironment: "PRODUCTION", page: 1, pageSize: 50,
      total: 1, nextPage: null, nextCursor: null, bills: [{ id: "WL-1", bizNo: "R1", bizType: "PROMOTION_REWARD",
        asset: "USDT", direction: "IN", amount: 0.000001, balanceAfter: 1.000001, status: "SUCCESS", createdAt: "2026-10-08T00:00:00Z" }] }).bills[0];
    expect(row.amountExact).toBeUndefined();
    const bill = { ...fixture("0.000001", "USDT"), amountExact: row.amountExact, balanceAfter: row.balanceAfter, balanceAfterExact: row.balanceAfterExact };
    const html = await render("en", [bill]);
    expect(html).toContain("+0.000001"); expect(html).toContain(`${en.bills.runningBalance}: 1.000001`);
  });
});
