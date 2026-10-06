import * as Vue from "vue";
import { createPinia, setActivePinia } from "pinia";
import { compileScript, parse } from "@vue/compiler-sfc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import listSource from "./rewards-list.vue?raw";
import summarySource from "./rewards.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { useLocaleStore } from "@/store/locale";
import { formatHowNumber } from "@/lib/rank-how-content";
import { resolveWalletBillMemo } from "@/lib/wallet-bill-display";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { courseRewardHref, resolveCourseNavigation } from "@/pages/learn/course-navigation";
import { courseRewardId, rewardsListCategory } from "./course-reward-link";
import type { Bill } from "@/store/bills";

// Compile and mount both complete production SFCs. Only their read-store and
// platform boundaries are fixtures; no API, browser, port or shared service runs.
function compile(source: string, filename: string) {
  const { descriptor } = parse(source, { filename });
  const script = compileScript(descriptor, { id: filename, inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" || tag === "text" } } });
  return ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const codes = { list: compile(listSource, "rewards-list.vue"), summary: compile(summarySource, "rewards.vue") };
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
type Locale = keyof typeof dicts;
const locales = ["zh", "en", "vi"] as const;
const totalCopy = {
  zh: "累计含待处理奖励，可用余额见钱包。",
  en: "Includes pending rewards. See wallet for available balance.",
  vi: "Gồm thưởng đang xử lý. Số dư khả dụng xem trong ví.",
};
const fixture = (status: Bill["status"], type: Bill["type"] = "refer"): Bill => ({
  id: "WL-840781", type, amount: 99.5, symbol: "NEX", status,
  ts: Date.parse("2026-10-05T11:48:21Z"), memo: "", memoKey: "refer", ref: "F2-NETWORK-NEX-376",
});
async function mount(localeCode: Locale, rows: Bill[] = [], page: keyof typeof codes = "list") {
  const locale = useLocaleStore(); locale.setLocale(localeCode);
  const pager = Vue.reactive({ rows, status: "ready", hasMore: false, loadingMore: false, error: "",
    refresh: vi.fn(async () => {}), loadMore: vi.fn(async () => {}) });
  const summary = { rewardsNex: 251.5, rewardsUsdt: 147.72 };
  const shown: Array<() => void> = [], navTo = vi.fn();
  const modules: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": {
      onLoad: (callback: (options: { cat: string }) => void) => callback({ cat: rows[0]?.symbol === "USDT" ? "usdt" : "nex" }),
      onShow: (callback: () => void) => shown.push(callback), onHide: vi.fn(),
    },
    "@/components/app-chassis.vue": { default: Vue.defineComponent({ setup: (_props, { slots }) => () => Vue.h("main", slots.default?.()) }) },
    "@/components/empty-state.vue": { default: Vue.defineComponent(() => () => Vue.h("empty")) },
    "@/components/sub-page-header.vue": { default: Vue.defineComponent({ props: ["back", "title"],
      setup: props => () => Vue.h("header", { back: props.back }, props.title) }) },
    "@/i18n/use-t": { useT: () => Vue.computed(() => dicts[locale.code as Locale]) },
    "@/i18n/format": { fmt }, "@/store/locale": { useLocaleStore }, "@/lib/rank-how-content": { formatHowNumber },
    "@/lib/wallet-bill-display": { resolveWalletBillMemo },
    "@/composables/use-course-reward-titles": { useCourseRewardTitles: () => Vue.ref({ "intro-uvel@v1": "UVEL intro" }) },
    "@/store/voucher": { useVoucher: () => ({ claimedUnused: [], expiredVouchers: [], remoteStatus: "ready", refreshRemote: vi.fn() }) },
    "@/store/bills": { useBills: () => ({ getLedger: () => pager, bills: [], summary, summaryStatus: "ready", refreshSummary: vi.fn(async () => {}) }), isRewardBill: vi.fn() },
    "@/store/rewards-seen": { useRewardsSeen: () => ({ markSeen: vi.fn() }) },
    "@/lib/remote-account-epoch": { remoteAccountScope: { snapshot: () => "user:7", isCurrent: () => true } },
    "./course-reward-link": { courseRewardId, rewardsListCategory }, "@/pages/learn/course-navigation": { courseRewardHref },
    "@/mock/products": { getProduct: vi.fn() }, "@/mock/vouchers": { isSingleSkuVoucher: vi.fn() },
    "@/lib/route": { navTo, takeNavigationQuery: () => "" },
    "@/composables/use-scroll-grow-progress": { useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView: Vue.ref(false) }) },
    "@/composables/use-manual-scroll-load-more": { useManualScrollLoadMore: vi.fn() },
    "@/api/runtime": { fundsServerEnabled: true, remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: 7 } }) } },
    "@/store/app": { useApp: () => ({ accountKey: "user:7", accountBindingEpoch: 1 }) },
    "@/store/auth": { useAuth: () => ({ accountId: "user:7", isAuthenticated: true }) },
    "@/lib/binary-session-ready": { binarySessionReady },
  };
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", codes[page])((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected reward dependency: ${id}`);
    return modules[id];
  }, exports);
  const root = node(), app = renderer.createApp(exports.default);
  app.mount(root); cleanups.push(() => app.unmount()); shown.forEach(callback => callback()); await Vue.nextTick();
  return { root, locale, pager, summary, navTo, text: () => textOf(root) };
}
beforeEach(() => {
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn(), getSystemInfoSync: () => ({ language: "en" }) });
  setActivePinia(createPinia());
});
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("mounted reward state presentation", () => {
  const cases = locales.flatMap(locale => (["posted", "pending", "failed"] as const).map(status => ({ locale, status })));
  it.each(cases)("shows $status referral state without changing the row in $locale", async ({ locale, status }) => {
    const rows = [fixture(status)], before = JSON.stringify(rows), page = await mount(locale, rows), t = dicts[locale];
    const label = status === "posted" ? t.bills.statusPosted : status === "pending" ? t.bills.statusPending : t.bills.statusFailed;
    expect(nodes(page.root).filter(entry => entry.tag === "text").map(textOf)).toContain(label);
    if (status === "posted") expect(page.text()).toContain(t.bills.memo.refer);
    else {
      expect(page.text()).not.toContain(t.bills.memo.refer);
      expect(page.text()).toContain(`${t.rewards.typeRefer} · F2-NETWORK-NEX-376`);
    }
    expect(page.text()).toContain(locale === "vi" ? "+99,5 NEX" : "+99.5 NEX");
    expect(JSON.stringify(rows)).toBe(before);
    expect(page.pager.refresh).toHaveBeenCalledOnce(); expect(page.pager.loadMore).not.toHaveBeenCalled();
  });

  it.each(locales)("explains both gross totals include pending rewards in %s", async locale => {
    const page = await mount(locale, [], "summary"), before = JSON.stringify(page.summary);
    expect(nodes(page.root).filter(entry => entry.tag === "text").map(textOf).filter(text => text === totalCopy[locale])).toHaveLength(2);
    expect(page.text()).toContain("$147.72"); expect(page.text()).toContain("251.5");
    expect(JSON.stringify(page.summary)).toBe(before);
    const nexCard = nodes(page.root).find(entry => entry.props.role === "button" && entry.props["aria-label"] === dicts[locale].rewards.catNex)!;
    (nexCard.props.onClick as () => void)(); expect(page.navTo).toHaveBeenCalledWith("/me/rewards/list?cat=nex");
  });

  it.each(locales)("preserves course source, round trip and exact precision in %s", async locale => {
    const rows: Bill[] = [{ ...fixture("pending", "achievement"), amount: 0.045005, memoKey: "learningReward", ref: "intro-uvel@v1" }];
    const before = JSON.stringify(rows), page = await mount(locale, rows), t = dicts[locale];
    expect(page.text()).toContain(`${t.bills.memo.learningReward} · UVEL intro`);
    expect(page.text()).toContain(locale === "vi" ? "+0,045005 NEX" : "+0.045005 NEX");
    expect(nodes(page.root).find(entry => entry.tag === "header")?.props.back).toBe("/pages/me/rewards");
    const link = nodes(page.root).find(entry => entry.props.role === "link")!;
    (link.props.onClick as () => void)();
    expect(page.navTo).toHaveBeenCalledWith("/pages/learn/course?id=intro-uvel&source=rewards-nex");
    expect(resolveCourseNavigation({ id: "intro-uvel", source: "rewards-nex" }, "").back).toBe("/pages/me/rewards-list?cat=nex");
    const sourceToggle = () => nodes(page.root).find(entry => entry.props.role === "button" && entry.props["aria-label"] === t.rewards.showSourceId)!;
    (sourceToggle().props.onClick as () => void)(); await Vue.nextTick();
    expect(nodes(page.root).filter(entry => entry.tag === "text").map(textOf)).toContain("intro-uvel@v1");
    const hide = nodes(page.root).find(entry => entry.props["aria-label"] === t.rewards.hideSourceId)!;
    (hide.props.onClick as () => void)(); await Vue.nextTick();
    expect(nodes(page.root).filter(entry => entry.tag === "text").map(textOf)).not.toContain("intro-uvel@v1");
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("updates state text after a posted transition and locale switch without mutating money", async () => {
    const rows = [fixture("pending")], page = await mount("en", rows);
    expect(page.text()).toContain(en.bills.statusPending); expect(page.text()).not.toContain(en.bills.memo.refer);
    page.pager.rows[0].status = "posted"; await Vue.nextTick();
    expect(page.text()).toContain(en.bills.statusPosted); expect(page.text()).toContain(en.bills.memo.refer);
    page.locale.setLocale("vi"); await Vue.nextTick();
    expect(page.text()).toContain(vietnamese.bills.statusPosted); expect(page.text()).toContain(vietnamese.bills.memo.refer);
    expect(page.text()).toContain("+99,5 NEX"); expect(rows[0].amount).toBe(99.5);
    expect(page.pager.refresh).toHaveBeenCalledOnce();
  });
});
