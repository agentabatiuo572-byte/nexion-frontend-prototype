import * as displayDate from "@/lib/display-date";
import * as brandCopy from "@/lib/brand-copy";
import { formatAmount } from "@/lib/amount-display";
import { formatUsd } from "@/lib/usd-display";
import * as Vue from "vue";
import { createPinia, setActivePinia } from "pinia";
import { compileScript, parse } from "@vue/compiler-sfc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import listSource from "./rewards-list.vue?raw";
import summarySource from "./rewards.vue?raw";
import legacySource from "../events/promotion-rewards.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { dateLocale, fmt } from "@/i18n/format";
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
const codes = { list: compile(listSource, "rewards-list.vue"), summary: compile(summarySource, "rewards.vue"), legacy: compile(legacySource, "promotion-rewards.vue") };
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
  id: "WL-840781", type, amount: 99.5, symbol: "UVT", status,
  ts: Date.parse("2026-10-05T11:48:21Z"), memo: "", memoKey: "refer", ref: "F2-NETWORK-NEX-376",
});
async function mount(localeCode: Locale, rows: Bill[] = [], page: keyof typeof codes = "list", category?: string, initialReadFailed = false) {
  const locale = useLocaleStore(); locale.setLocale(localeCode);
  const pager = Vue.reactive({ rows, status: "ready", hasMore: false, loadingMore: false, error: "",
    refresh: vi.fn(async () => {}), loadMore: vi.fn(async () => {}) });
  const bills = Vue.reactive({ getLedger: () => pager, bills: [], summary: { rewardsNex: 251.5, rewardsUsdt: 147.72 } as { rewardsNex: number; rewardsUsdt: number } | null,
    summaryStatus: "ready", refreshSummary: vi.fn(async () => {}) });
  const voucher = Vue.reactive({ claimedUnused: [] as unknown[], expiredVouchers: [] as unknown[], remoteStatus: "ready", refreshRemote: vi.fn() });
  if (initialReadFailed) { bills.summary = null; bills.summaryStatus = "error"; voucher.remoteStatus = "error"; }
  const account = Vue.reactive({ accountKey: "user:7", accountBindingEpoch: 1 });
  const shown: Array<() => void> = [], navTo = vi.fn();
  const modules: Record<string, unknown> = {
    "@/lib/brand-copy": brandCopy,
    "@/lib/amount-display": { formatAmount },
    "@/lib/usd-display": { formatUsd },
    vue: Vue, "@dcloudio/uni-app": {
      onLoad: (callback: (options: { cat: string; activityId: string; orderNo: string }) => void) => callback({ cat: category ?? (rows[0]?.symbol === "USDT" ? "usdt" : "uvt"), activityId: "campaign-A", orderNo: "order-A" }),
      onShow: (callback: () => void) => shown.push(callback), onHide: vi.fn(),
    },
    "@/components/app-chassis.vue": { default: Vue.defineComponent({ setup: (_props, { slots }) => () => Vue.h("main", slots.default?.()) }) },
    "@/components/empty-state.vue": { default: Vue.defineComponent(() => () => Vue.h("empty")) },
    "@/components/sub-page-header.vue": { default: Vue.defineComponent({ props: ["back", "title"],
      setup: props => () => Vue.h("header", { back: props.back }, props.title) }) },
    "@/components/promotion/promotion-reward-list.vue": { default: Vue.defineComponent({ props: ["activityId", "orderNo"],
      setup: props => () => Vue.h("promotion-rewards", { activityId: props.activityId, orderNo: props.orderNo }) }) },
    "@/i18n/use-t": { useT: () => Vue.computed(() => dicts[locale.code as Locale]) },
    "@/lib/display-date": displayDate, "@/i18n/format": { dateLocale, fmt }, "@/store/locale": { useLocaleStore }, "@/lib/rank-how-content": { formatHowNumber },
    "@/lib/wallet-bill-display": { resolveWalletBillMemo },
    "@/composables/use-course-reward-titles": { useCourseRewardTitles: () => Vue.ref({ "intro-uvel@v1": "UVEL intro" }) },
    "@/store/voucher": { useVoucher: () => voucher },
    "@/store/bills": { useBills: () => bills, isRewardBill: vi.fn() },
    "@/store/rewards-seen": { useRewardsSeen: () => ({ markSeen: vi.fn() }) },
    "@/lib/remote-account-epoch": { remoteAccountScope: { snapshot: () => `${account.accountKey}:${account.accountBindingEpoch}`,
      isCurrent: (snapshot: string) => snapshot === `${account.accountKey}:${account.accountBindingEpoch}` } },
    "./course-reward-link": { courseRewardId, rewardsListCategory }, "@/pages/learn/course-navigation": { courseRewardHref },
    "@/mock/products": { getProduct: vi.fn() }, "@/mock/vouchers": { isSingleSkuVoucher: vi.fn() },
    "@/lib/route": { navTo, takeNavigationQuery: () => "" },
    "@/composables/use-scroll-grow-progress": { useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView: Vue.ref(false) }) },
    "@/composables/use-manual-scroll-load-more": { useManualScrollLoadMore: vi.fn() },
    "@/api/runtime": { fundsServerEnabled: true, remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: 7 } }) } },
    "@/store/app": { useApp: () => account },
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
  return { root, locale, pager, summary: bills.summary, bills, voucher, account, navTo, text: () => textOf(root) };
}
const tokenPath = decodeURIComponent(new URL("../../styles/tokens.css", import.meta.url).pathname).replace(/^\/([a-z]:\/)/i, "$1");
const tokenSource = (() => {
  const source = ts.sys.readFile(tokenPath);
  if (source === undefined) throw new Error(`Reward contrast tokens not readable: ${tokenPath}`);
  return source;
})();
// Resolve current hex/rgba tokens and srgb tints; unsupported syntax fails the gate.
function failureContrast(style: Vue.CSSProperties, theme: "light" | "dark") {
  const light = tokenSource.match(/:root\s*\{([^}]+)\}/)![1];
  const dark = tokenSource.match(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]+)\}/)![1];
  const colors = Object.fromEntries([...`${light}${theme === "dark" ? dark : ""}`.matchAll(/(--[\w-]+):\s*(#[\da-f]{6}|rgba\([^)]*\))\s*;/gi)]
    .map(match => [match[1], match[2]]));
  const rgb = (value: string) => {
    const token = value.match(/^var\((--[\w-]+)\)$/), color = token ? colors[token[1]] : value;
    expect(color).toBeDefined();
    if (/^#[\da-f]{6}$/i.test(color)) return [...[1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255), 1];
    const channels = color.match(/^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)$/);
    expect(channels).not.toBeNull();
    return channels!.slice(1).map((channel, index) => Number(channel) / (index < 3 ? 255 : 1));
  };
  const mix = String(style.background).match(/^color-mix\(in srgb, (var\(--[\w-]+\)|#[\da-f]{6}) (\d+(?:\.\d+)?)%, transparent\)$/i);
  const tint = rgb(mix ? mix[1] : String(style.background)), page = rgb("var(--v5-bg)");
  const alpha = tint[3] * (mix ? Number(mix[2]) / 100 : 1);
  const background = tint.slice(0, 3).map((channel, index) => channel * alpha + page[index] * (1 - alpha));
  const luminance = (channels: number[]) => channels
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const [bright, dim] = [luminance(rgb(String(style.color)).slice(0, 3)), luminance(background)].sort((a, b) => b - a);
  return (bright + 0.05) / (dim + 0.05);
}

beforeEach(() => {
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn(), getSystemInfoSync: () => ({ language: "en" }) });
  setActivePinia(createPinia());
});
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("mounted reward state presentation", () => {
  it.each(["light", "dark"] as const)("keeps danger text readable on existing %s notice and status backgrounds", theme => {
    const backgrounds = ["var(--v5-bg)", "var(--v5-surface)", "var(--v5-surface-2)", "var(--v5-surface-3)", "var(--v5-danger-soft)",
      ...[6, 8, 10, 15].map(alpha => `color-mix(in srgb, var(--v5-danger) ${alpha}%, transparent)`)];
    for (const background of backgrounds) {
      expect(failureContrast({ color: "var(--v5-danger)", background }, theme), background).toBeGreaterThanOrEqual(4.5);
    }
    expect(failureContrast({ color: "var(--v5-on-brand)", background: "var(--v5-danger)" }, theme)).toBeGreaterThanOrEqual(4.5);
  });

  const contrastCases = locales.flatMap(locale => (["light", "dark"] as const).map(theme => ({ locale, theme })));
  it.each(contrastCases)("keeps the rendered failure notice readable in $locale/$theme", async ({ locale, theme }) => {
    const screen = await mount(locale, [], "summary", undefined, true);
    const message = nodes(screen.root).find(entry => entry.tag === "text" && textOf(entry) === dicts[locale].walletV3.submitReasonServiceUnavailable)!;
    expect(message).toBeDefined();
    const style = message.parent!.props.style as Vue.CSSProperties;
    expect(failureContrast(style, theme)).toBeGreaterThanOrEqual(4.5);
    if (theme === "light") expect(failureContrast({ color: "#B9554A", background: "color-mix(in srgb, #B9554A 10%, transparent)" }, theme)).toBeLessThan(4.5);
  });

  it.each(locales)("keeps the old activity reward URL on the same category body and back route in %s", async locale => {
    const screen = await mount(locale, [], "legacy"), header = nodes(screen.root).find(entry => entry.tag === "header");
    expect(header?.text).toBe(dicts[locale].promotion.rewardCategory);
    expect(header?.props.back).toBe("/pages/me/rewards");
    expect(nodes(screen.root).find(entry => entry.tag === "promotion-rewards")?.props).toEqual({ activityId: "campaign-A", orderNo: "order-A" });
    expect(screen.pager.refresh).not.toHaveBeenCalled(); expect(screen.pager.loadMore).not.toHaveBeenCalled();
  });

  it("keeps totals during a same-account refresh but clears all cached counts on account rebinding", async () => {
    const screen = await mount("en", [], "summary");
    const totals = () => nodes(screen.root).filter(entry => entry.props.class === "font-mono-tabular").map(textOf);
    screen.voucher.claimedUnused = [{ id: "old-1" }, { id: "old-2" }]; await Vue.nextTick();
    expect(totals()).toEqual(["2", "$147.72", "251.50"]);
    screen.voucher.remoteStatus = "loading"; screen.voucher.claimedUnused = [];
    screen.bills.summaryStatus = "loading"; screen.bills.summary = null; await Vue.nextTick();
    expect(totals()).toEqual(["2", "$147.72", "251.50"]);
    screen.account.accountBindingEpoch++; screen.account.accountKey = "user:8"; await Vue.nextTick();
    expect(totals()).toEqual(["-", "-", "-"]);
    screen.voucher.remoteStatus = "ready"; screen.bills.summary = { rewardsUsdt: 5, rewardsNex: 6 };
    screen.bills.summaryStatus = "ready"; await Vue.nextTick();
    expect(totals()).toEqual(["0", "$5.00", "6.00"]);
  });

  it.each(locales)("keeps uncached failed reads unknown until retry restores values, including fixture zeros in %s", async locale => {
    const screen = await mount(locale, [], "summary", undefined, true), t = dicts[locale];
    const totals = () => nodes(screen.root).filter(entry => entry.props.class === "font-mono-tabular").map(textOf);
    expect(totals()).toEqual(["-", "-", "-"]);
    expect(screen.text()).toContain(t.walletV3.submitReasonServiceUnavailable);
    expect(screen.text()).not.toContain(t.rewards.emptyHint);
    const retry = nodes(screen.root).find(entry => entry.props.role === "button" && textOf(entry) === t.store.catalogRetry)!;
    expect(retry).toBeDefined();
    let finishRead!: () => void;
    const read = new Promise<void>(resolve => { finishRead = resolve; });
    screen.voucher.refreshRemote.mockImplementation(() => { screen.voucher.remoteStatus = "loading"; return read; });
    screen.bills.refreshSummary.mockImplementation(async () => { screen.bills.summaryStatus = "loading"; await read; });
    const pending = (retry.props.onClick as () => Promise<void>)(); await Vue.nextTick();
    expect(screen.voucher.refreshRemote).toHaveBeenCalledTimes(2);
    expect(screen.bills.refreshSummary).toHaveBeenCalledTimes(2);
    expect(totals()).toEqual(["-", "-", "-"]);
    expect(screen.text()).not.toContain(t.rewards.emptyHint);
    screen.voucher.claimedUnused = [{ id: "recovered-1" }, { id: "recovered-2" }]; screen.voucher.remoteStatus = "ready";
    screen.bills.summary = { rewardsUsdt: 12.5, rewardsNex: 340 }; screen.bills.summaryStatus = "ready";
    finishRead(); await pending; await Vue.nextTick();
    expect(totals()).toEqual(["2", "$12.50", "340.00"]);
    expect(screen.text()).not.toContain(t.walletV3.submitReasonServiceUnavailable);
    expect(screen.text()).not.toContain(t.store.catalogRetry);
    screen.voucher.remoteStatus = "error"; screen.voucher.claimedUnused = [];
    screen.bills.summaryStatus = "error"; screen.bills.summary = null; await Vue.nextTick();
    expect(totals()).toEqual(["2", "$12.50", "340.00"]);
    expect(screen.text()).toContain(t.walletV3.submitReasonServiceUnavailable);
    screen.voucher.remoteStatus = "ready"; screen.bills.summary = { rewardsUsdt: 0, rewardsNex: 0 };
    screen.bills.summaryStatus = "ready"; await Vue.nextTick();
    expect(totals()).toEqual(["0", "$0.00", "0.00"]);
    expect(screen.text()).toContain(t.rewards.emptyHint);
    expect(screen.text()).not.toContain(t.walletV3.submitReasonServiceUnavailable);
  });

  it.each(locales)("adds the activity category without mixing gifts into currency totals in %s", async locale => {
    const summary = await mount(locale, [], "summary"), t = dicts[locale];
    const cards = nodes(summary.root).filter(entry => entry.props.role === "button" && entry.props["aria-label"]);
    expect(cards.map(card => card.props["aria-label"])).toEqual([t.rewards.catVouchers, t.rewards.catUsdt, t.rewards.catNex, t.promotion.rewardCategory]);
    const promotion = cards[3]; expect(textOf(promotion)).toContain(t.promotion.rewardCategoryDesc);
    expect(nodes(promotion).some(entry => entry.props.class === "font-mono-tabular")).toBe(false);
    (promotion.props.onClick as () => void)(); expect(summary.navTo).toHaveBeenCalledWith("/me/rewards/list?cat=promotion");
    const list = await mount(locale, [], "list", "promotion");
    expect(nodes(list.root).find(entry => entry.tag === "header")?.text).toBe(t.promotion.rewardCategory);
    expect(nodes(list.root).find(entry => entry.tag === "promotion-rewards")?.props).toEqual({ activityId: "campaign-A", orderNo: "order-A" });
    expect(list.pager.refresh).not.toHaveBeenCalled(); expect(list.pager.loadMore).not.toHaveBeenCalled();
  });

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
    expect(page.text()).toContain("+99.50 UVT");
    expect(JSON.stringify(rows)).toBe(before);
    expect(page.pager.refresh).toHaveBeenCalledOnce(); expect(page.pager.loadMore).not.toHaveBeenCalled();
  });

  it.each(locales)("explains both gross totals include pending rewards in %s", async locale => {
    const page = await mount(locale, [], "summary"), before = JSON.stringify(page.summary);
    expect(nodes(page.root).filter(entry => entry.tag === "text").map(textOf).filter(text => text === totalCopy[locale])).toHaveLength(2);
    expect(page.text()).toContain("$147.72"); expect(page.text()).toContain("251.50");
    expect(JSON.stringify(page.summary)).toBe(before);
    const nexCard = nodes(page.root).find(entry => entry.props.role === "button" && entry.props["aria-label"] === dicts[locale].rewards.catNex)!;
    (nexCard.props.onClick as () => void)(); expect(page.navTo).toHaveBeenCalledWith("/me/rewards/list?cat=uvt");
  });

  it.each(locales)("preserves course source, round trip and model precision in %s", async locale => {
    const rows: Bill[] = [{ ...fixture("pending", "achievement"), amount: 0.045005, memoKey: "learningReward", ref: "intro-uvel@v1" }];
    const before = JSON.stringify(rows), page = await mount(locale, rows), t = dicts[locale];
    expect(page.text()).toContain(`${t.bills.memo.learningReward} · UVEL intro`);
    expect(page.text()).toContain("+0.05 UVT");
    expect(nodes(page.root).find(entry => entry.tag === "header")?.props.back).toBe("/pages/me/rewards");
    const link = nodes(page.root).find(entry => entry.props.role === "link")!;
    (link.props.onClick as () => void)();
    expect(page.navTo).toHaveBeenCalledWith("/pages/learn/course?id=intro-uvel&source=rewards-uvt");
    expect(resolveCourseNavigation({ id: "intro-uvel", source: "rewards-uvt" }, "").back).toBe("/pages/me/rewards-list?cat=uvt");
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
    expect(page.text()).toContain("+99.50 UVT"); expect(rows[0].amount).toBe(99.5);
    expect(page.pager.refresh).toHaveBeenCalledOnce();
  });
});
