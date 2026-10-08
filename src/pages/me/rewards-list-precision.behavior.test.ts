import * as Vue from "vue";
import { createPinia, setActivePinia } from "pinia";
import { compileScript, parse } from "@vue/compiler-sfc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./rewards-list.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { useLocaleStore } from "@/store/locale";
import { formatHowNumber } from "@/lib/rank-how-content";
import { resolveWalletBillMemo } from "@/lib/wallet-bill-display";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { courseRewardId, rewardsListCategory } from "./course-reward-link";
import type { Bill } from "@/store/bills";

// Mount the complete production SFC, including its actual formatter and locale
// store. The host and read-store boundary are local; no reward API is called.
const { descriptor } = parse(source, { filename: "rewards-list.vue" });
const script = compileScript(descriptor, { id: "rewards-detail-precision", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" || tag === "text" } } });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type HostNode = { tag: string; text: string; props: Record<string, unknown>; parent: HostNode | null; children: HostNode[] };
const node = (text = "", tag = ""): HostNode => ({ tag, text, props: {}, parent: null, children: [] });
function remove(child: HostNode) {
  if (child.parent) child.parent.children = child.parent.children.filter(entry => entry !== child);
  child.parent = null;
}
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: tag => node("", tag), createText: text => node(text), createComment: () => node(),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    remove(child); child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  }, remove,
});
const nodes = (target: HostNode): HostNode[] => [target, ...target.children.flatMap(nodes)];
const textOf = (target: HostNode): string => target.text + target.children.map(textOf).join("");
const cleanups: Array<() => void> = [], dicts = { zh, en, vi: vietnamese };
const fixture = (amount: number, symbol: Bill["symbol"] = "USDT"): Bill => ({
  id: `local-reward-${amount}`, type: "bonus", amount, symbol, status: "posted",
  ts: Date.parse("2026-10-04T18:51:00Z"), memo: "", memoKey: "bonus",
});
async function mount(localeCode: "zh" | "en" | "vi", rows: Bill[]) {
  const locale = useLocaleStore(); locale.setLocale(localeCode);
  const pager = Vue.reactive({ rows, status: "ready", hasMore: false, loadingMore: false, error: "",
    refresh: vi.fn(async () => {}), loadMore: vi.fn(async () => {}) });
  const shown: Array<() => void> = [], chassis = Vue.defineComponent({ setup: (_props, { slots }) => () => Vue.h("main", slots.default?.()) });
  const modules: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onLoad: (callback: (options: { cat: string }) => void) => callback({ cat: rows[0]?.symbol === "NEX" ? "nex" : "usdt" }),
      onShow: (callback: () => void) => shown.push(callback) },
    "@/components/app-chassis.vue": { default: chassis }, "@/components/empty-state.vue": { default: Vue.defineComponent(() => () => Vue.h("empty")) },
    "@/components/sub-page-header.vue": { default: Vue.defineComponent(() => () => Vue.h("header")) },
    "@/components/promotion/promotion-reward-list.vue": { default: Vue.defineComponent(() => () => Vue.h("promotion-rewards")) },
    "@/i18n/use-t": { useT: () => Vue.computed(() => dicts[locale.code as keyof typeof dicts]) },
    "@/i18n/format": { fmt }, "@/store/locale": { useLocaleStore }, "@/lib/rank-how-content": { formatHowNumber },
    "@/lib/wallet-bill-display": { resolveWalletBillMemo }, "@/composables/use-course-reward-titles": { useCourseRewardTitles: () => Vue.ref({}) },
    "@/store/voucher": { useVoucher: () => ({ claimedUnused: [], expiredVouchers: [], remoteStatus: "ready", refreshRemote: vi.fn() }) },
    "@/store/bills": { useBills: () => ({ getLedger: () => pager }), isRewardBill: vi.fn() },
    "./course-reward-link": { courseRewardId, rewardsListCategory }, "@/pages/learn/course-navigation": { courseRewardHref: vi.fn() },
    "@/mock/products": { getProduct: vi.fn() }, "@/mock/vouchers": { isSingleSkuVoucher: vi.fn() },
    "@/lib/route": { navTo: vi.fn(), takeNavigationQuery: () => "" },
    "@/composables/use-scroll-grow-progress": { useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView: Vue.ref(false) }) },
    "@/composables/use-manual-scroll-load-more": { useManualScrollLoadMore: vi.fn() },
    "@/api/runtime": { fundsServerEnabled: true, remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: 7 } }) } },
    "@/store/app": { useApp: () => ({ accountKey: "user:7", accountBindingEpoch: 1 }) },
    "@/store/auth": { useAuth: () => ({ accountId: "user:7", isAuthenticated: true }) },
    "@/lib/binary-session-ready": { binarySessionReady },
  };
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected reward detail dependency: ${id}`);
    return modules[id];
  }, exports);
  const root = node(), app = renderer.createApp(exports.default);
  app.mount(root); cleanups.push(() => app.unmount()); shown.forEach(callback => callback()); await Vue.nextTick();
  return { locale, pager, amounts: () => nodes(root).filter(entry => entry.tag === "text"
    && entry.props.class === "block tabular-nums").map(textOf) };
}
beforeEach(() => {
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn(), getSystemInfoSync: () => ({ language: "en" }) });
  setActivePinia(createPinia());
});
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("mounted reward detail precision", () => {
  it.each(["zh", "en", "vi"] as const)("keeps six non-zero decimals, symbols, compact NEX and signs in %s", async locale => {
    const rows = [fixture(0.045005), fixture(0.000001), fixture(1234.045005), fixture(-0.045005)];
    const before = JSON.stringify(rows), page = await mount(locale, rows);
    expect(page.amounts()).toEqual(locale === "vi"
      ? ["+0,045005 USDT", "+0,000001 USDT", "+1.234,045005 USDT", "-0,045005 USDT"]
      : ["+0.045005 USDT", "+0.000001 USDT", "+1,234.045005 USDT", "-0.045005 USDT"]);
    const nexPage = await mount(locale, [fixture(146, "NEX")]); expect(nexPage.amounts()).toEqual(["+146 NEX"]);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it.each(["zh", "en", "vi"] as const)("renders the same exact detail output without Intl or native number localization in %s", async locale => {
    vi.stubGlobal("Intl", undefined);
    const nativeFormat = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(() => { throw new Error("NATIVE_LOCALE_FORMAT_UNAVAILABLE"); });
    const page = await mount(locale, [fixture(0.045005), fixture(0.000001), fixture(-1234.045005)]);
    expect(page.amounts()).toEqual(locale === "vi"
      ? ["+0,045005 USDT", "+0,000001 USDT", "-1.234,045005 USDT"]
      : ["+0.045005 USDT", "+0.000001 USDT", "-1,234.045005 USDT"]);
    const nexPage = await mount(locale, [fixture(146, "NEX")]); expect(nexPage.amounts()).toEqual(["+146 NEX"]);
    expect(nativeFormat).not.toHaveBeenCalled();
  });

  it("reacts to the locale picker without rereading or changing the authoritative amount", async () => {
    const rows = [fixture(1234.045005)], page = await mount("en", rows), before = JSON.stringify(rows);
    expect(page.amounts()).toEqual(["+1,234.045005 USDT"]);
    page.locale.setLocale("vi"); await Vue.nextTick(); expect(page.amounts()).toEqual(["+1.234,045005 USDT"]);
    page.locale.setLocale("zh"); await Vue.nextTick(); expect(page.amounts()).toEqual(["+1,234.045005 USDT"]);
    expect(page.pager.refresh).toHaveBeenCalledOnce(); expect(page.pager.loadMore).not.toHaveBeenCalled();
    expect(JSON.stringify(rows)).toBe(before);
  });
});
