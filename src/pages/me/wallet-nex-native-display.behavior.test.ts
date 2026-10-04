import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { formatTrialDateTime } from "@/lib/trial-date";
import { resolveWalletBillMemo } from "@/lib/wallet-bill-display";
import { remoteAuthorityStatus } from "@/lib/remote-authority-display";
import source from "./wallet-nex.vue?raw";

// Compile and mount the production page, replacing only its stores and host.
const { descriptor } = parse(source, { filename: "wallet-nex.vue" });
const script = compileScript(descriptor, {
  id: "wallet-nex-native-display", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" || tag === "text" } },
});
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type Host = { tag: string; text: string; parent: Host | null; children: Host[] };
const node = (tag = "", text = ""): Host => ({ tag, text, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: () => node("#comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: () => {}, parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  },
  remove: child => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    child.parent = null;
  },
});
const textContent = (root: Host): string => root.text + root.children.map(textContent).join("");
const texts = (root: Host): string[] => [
  ...(root.tag === "text" ? [textContent(root)] : []), ...root.children.flatMap(texts),
];
const unmounts: Array<() => void> = [];
const timestamp = new Date(2026, 9, 3, 16, 34, 40).getTime();
const bill = (amount = 3, ts = timestamp) => ({ id: "nex:1", amount, ts, symbol: "NEX", status: "settled", memo: "", memoKey: "mining" });
async function mount(translations = en) {
  const app = Vue.reactive({ user: { nexBalance: 143 }, remoteFleetHasSnapshot: true, visibleDevices: [], refreshRemoteFleet: vi.fn(async () => {}) });
  const market = Vue.reactive({
    nexPriceUSDT: 0.124, costBasis: 0.085, change24hPct: 0, change24hAvailable: true,
    klineHourly: [], remoteReady: true, remoteError: null as string | null,
    isMockMode: false, syncRemote: vi.fn(async () => {}), tickPrice: vi.fn(),
  });
  const bills = Vue.reactive({
    summaryStatus: "ready", summary: { todayNexEarn: 0, pendingNex: 0, recentNexBills: [bill()] },
    refreshSummary: vi.fn(async () => {}),
  });
  const chassis = { setup: (_props: unknown, { slots }: { slots: Vue.Slots }) => () => Vue.h("view", slots.default?.()) };
  const empty = { render: () => null };
  const modules: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: () => {} },
    "@/components/app-chassis.vue": { default: chassis },
    "@/components/sub-page-header.vue": { default: empty },
    "@/components/empty-state.vue": { default: empty },
    "@/components/me/nex-sparkline.vue": { default: empty },
    "@/lib/route": { navReset: vi.fn(), navTo: vi.fn() },
    "@/i18n/use-t": { useT: () => Vue.ref(translations) },
    "@/i18n/format": { dateLocale: () => "en-US" },
    "@/lib/trial-date": { formatTrialDateTime },
    "@/lib/wallet-bill-display": { resolveWalletBillMemo },
    "@/lib/remote-authority-display": { remoteAuthorityStatus },
    "@/store/app": { useApp: () => app }, "@/store/market": { useMarket: () => market },
    "@/store/bills": { useBills: () => bills }, "@/store/commission": { useCommission: () => ({ events: [] }) },
    "@/api/runtime": { remoteApiEnabled: true },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected wallet page import: ${id}`);
    return modules[id];
  }, exports);
  const root = node(), component = renderer.createApp(exports.default);
  component.mount(root); unmounts.push(() => component.unmount());
  await Vue.nextTick();
  return { app, market, bills, text: () => texts(root), wholeText: () => textContent(root) };
}

beforeEach(() => {
  vi.useFakeTimers();
  // These match the observed Android fallbacks: precision/locale are ignored.
  vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (this: number) { return String(Number(this)); });
  vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (this: Date) { return this.toString(); });
});
afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount());
  vi.restoreAllMocks(); vi.useRealTimers();
});

describe("mounted NEX wallet Android display", () => {
  it("rounds the observed balance, valuation, baseline estimate and activity without changing their inputs", async () => {
    const s = await mount();
    expect(s.text()).toEqual(expect.arrayContaining([
      "143.00", "143.00 NEX", "≈ $17.73", "$17.73", "$0.085", "$12.16",
      "+$5.58 (+45.9%)", "+3.00 NEX", "≈ $0.37",
    ]));
    expect(s.app.user.nexBalance).toBe(143); expect(s.market.nexPriceUSDT).toBe(0.124);
    expect(s.market.costBasis).toBe(0.085); expect(s.bills.summary.recentNexBills[0].amount).toBe(3);
    expect(Number.prototype.toLocaleString).not.toHaveBeenCalled();
  });

  it("groups only integer digits while preserving two decimals and negative values", async () => {
    const s = await mount();
    s.app.user.nexBalance = 1234567.891; s.market.nexPriceUSDT = 2; s.market.costBasis = 1;
    s.bills.summary.todayNexEarn = -2345.678; s.bills.summary.pendingNex = 9876.543;
    s.bills.summary.recentNexBills = [bill(-1234.56789)];
    await Vue.nextTick();
    expect(s.text()).toEqual(expect.arrayContaining([
      "1,234,567.89", "1,234,567.89 NEX", "≈ $2,469,135.78", "$1,234,567.89", "$1.000",
      "+$1,234,567.89 (+100.0%)", "-2,345.68 NEX", "9,876.54 NEX", "-1,234.57 NEX", "≈ $-2,469.14",
    ]));
    s.market.costBasis = 1234.567; await Vue.nextTick();
    expect(s.text()).toContain("$1,234.567");
    expect(s.app.user.nexBalance).toBe(1234567.891);
    expect(s.bills.summary.recentNexBills[0].amount).toBe(-1234.56789);
  });

  it("keeps confirmed zero and negative estimates readable with their existing signs", async () => {
    const s = await mount(); s.app.user.nexBalance = 0; s.bills.summary.recentNexBills = [bill(0)];
    await Vue.nextTick();
    expect(s.text()).toEqual(expect.arrayContaining(["0.00", "0.00 NEX", "+0.00 NEX", "≈ $0.00", "$0.00", "+$0.00 (+0.0%)"]));
    s.app.user.nexBalance = 2; s.market.nexPriceUSDT = 1; s.market.costBasis = 2;
    await Vue.nextTick(); expect(s.text()).toContain("$-2.00 (-50.0%)");
  });

  it("retains balance and quote authority gates through snapshot changes", async () => {
    const s = await mount(); s.app.remoteFleetHasSnapshot = false; await Vue.nextTick();
    expect(s.text()).toContain("—"); expect(s.text()).not.toContain("143.00");
    s.app.remoteFleetHasSnapshot = true; s.market.remoteReady = false; s.market.remoteError = "offline";
    await Vue.nextTick();
    expect(s.text()).toContain("143.00"); expect(s.text()).toContain("+3.00 NEX");
    expect(s.text()).toContain("≈ —"); expect(s.text()).not.toContain("≈ $17.73");
  });

  it.each([NaN, Infinity, -Infinity])("uses neutral display for non-finite amounts %s", async amount => {
    const s = await mount(); s.app.user.nexBalance = amount;
    s.market.costBasis = amount; s.market.change24hPct = amount;
    s.bills.summary.todayNexEarn = amount; s.bills.summary.pendingNex = amount;
    s.bills.summary.recentNexBills = [bill(amount)]; await Vue.nextTick();
    expect(s.text()).toContain("—"); expect(s.text()).toContain("≈ —");
    expect(s.text()).toContain("— NEX");
    expect(s.wholeText()).not.toMatch(/NaN|Infinity|\$—|\+—/);
  });

  it.each([["en", en], ["zh", zh], ["vi", vietnamese]] as const)("renders activity in device-local time despite the %s locale fallback", async (_locale, translations) => {
    const s = await mount(translations);
    expect(s.text()).toContain("2026-10-03 16:34:40");
    expect(s.wholeText()).not.toContain("GMT");
    expect(Date.prototype.toLocaleString).not.toHaveBeenCalled();
    expect(s.bills.summary.recentNexBills[0].ts).toBe(timestamp);
  });

  it.each([NaN, Infinity, -Infinity, 9e15])("uses a neutral activity time for invalid timestamp %s", async ts => {
    const s = await mount(); s.bills.summary.recentNexBills = [bill(3, ts)]; await Vue.nextTick();
    expect(s.text()).toContain("—"); expect(s.text()).toContain("+3.00 NEX");
    expect(s.wholeText()).not.toMatch(/Invalid Date|NaN|Infinity/);
    expect(s.bills.summary.recentNexBills[0].ts).toBe(ts);
  });
});
