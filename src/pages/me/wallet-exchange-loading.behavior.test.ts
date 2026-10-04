import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { en } from "@/i18n/messages/en";
import { exchangeQuote } from "@/lib/exchange-quote";
import { remoteAuthorityStatus } from "@/lib/remote-authority-display";
import { createRemoteAuthorityCoordinator } from "@/lib/remote-authority-coordinator";
import { canShowExchangeToast } from "@/lib/exchange-scope-toast";
import * as exchangeInput from "@/lib/exchange-input-amount";
import * as exchangeCancel from "@/lib/exchange-cancel";
import * as exchangePending from "@/lib/exchange-pending-mutation";
import type { ExchangeSnapshot } from "@/api/exchange-api";
import page from "./wallet-exchange.vue?raw";

// Mount the real page script and template; control only its transport and host.
const { descriptor } = parse(page, { filename: "wallet-exchange.vue" });
const script = compileScript(descriptor, {
  id: "exchange-loading-behavior", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" || tag === "text" } },
});
const code = ts.transpileModule(script.content.replaceAll("import.meta.env.DEV", "false"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type HostNode = { tag: string; text: string; props: Record<string, any>; parent: HostNode | null; children: HostNode[] };
const node = (text = "", tag = ""): HostNode => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: tag => node("", tag), createText: node, createComment: () => node(),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(entry => entry !== child);
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  },
  remove: child => {
    if (child.parent) child.parent.children = child.parent.children.filter(entry => entry !== child);
    child.parent = null;
  },
});
const textContent = (target: HostNode): string => target.text + target.children.map(textContent).join("");
function find(root: HostNode, predicate: (entry: HostNode) => boolean): HostNode {
  if (predicate(root)) return root;
  for (const child of root.children) {
    try { return find(child, predicate); } catch { /* Continue through sibling branches. */ }
  }
  throw new Error("Expected mounted page control");
}
const unmounts: Array<() => void> = [];
const flush = async () => {
  for (let turn = 0; turn < 4; turn++) await Promise.resolve();
  await Vue.nextTick();
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function snapshot(): ExchangeSnapshot {
  return {
    caps: {
      currentPrice: 0.124, userDailyCapUsdt: 49, platformDailyCapUsdt: 20000,
      feePct: 0.01, feeMinUsdt: 0.5, minUsdt: 1, minNex: 10,
      queueMode: "REJECT", swapEnabled: false, sourceEnvironment: "PRODUCTION", runId: "",
    },
    wallet: { usdtAvailable: 110.1, nexAvailable: 124 },
    todayUserUsedUsdt: 0, todayPlatformUsedUsdt: 0, lifetimeExchangedUsdt: 0,
    orders: [], ordersPage: { total: 0, pageNum: 1, pageSize: 20, snapshotId: "0" },
    sourceEnvironment: "PRODUCTION", runId: "",
  };
}
async function mount(direction = "nex2usdt") {
  const shown: Array<() => void> = [], hidden: Array<() => void> = [];
  const requests: Array<ReturnType<typeof deferred<ExchangeSnapshot>>> = [];
  const fetchState = vi.fn(() => {
    const response = deferred<ExchangeSnapshot>(); requests.push(response); return response.promise;
  });
  const swap = vi.fn(), confirm = vi.fn(), navTo = vi.fn();
  const chassis = Vue.defineComponent({ setup: (_props, { slots }) => () => Vue.h("chassis", slots.default?.()) });
  const empty = Vue.defineComponent({ props: ["title"], setup: props => () => Vue.h("empty", props.title) });
  const header = Vue.defineComponent({ props: ["title"], setup: props => () => Vue.h("header", props.title) });
  const accountKey = "user:exchange-loading-fixture";
  const dependencies: Record<string, unknown> = {
    vue: Vue,
    "@dcloudio/uni-app": {
      onLoad: (callback: (options: { direction: string }) => void) => callback({ direction }),
      onShow: (callback: () => void) => shown.push(callback), onHide: (callback: () => void) => hidden.push(callback),
    },
    "@/components/app-chassis.vue": { default: chassis },
    "@/components/empty-state.vue": { default: empty },
    "@/components/sub-page-header.vue": { default: header },
    "@/lib/route": { navTo }, "@/lib/exchange-quote": { exchangeQuote },
    "@/i18n/use-t": { useT: () => Vue.ref(en) },
    "@/i18n/format": { dateLocale: () => "en", fmt: (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_match, key) => values[key]) },
    "@/api/geo-policy-error": { geoPolicyUserMessage: vi.fn() },
    "@/lib/remote-authority-display": { remoteAuthorityStatus },
    "@/store/ui": { toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() }, confirm },
    "@/store/app": { useApp: () => ({ accountKey, user: { usdtBalance: 9999, nexBalance: 9999 } }) },
    "@/lib/money-receipt": { postMoneyBills: vi.fn() },
    "@/lib/exchange-pending-mutation": exchangePending, "@/lib/exchange-cancel": exchangeCancel,
    "@/lib/account-scope": { captureAccountScope: () => ({ accountKey, epoch: 1 }), isCurrentAccountScope: () => true },
    "@/api/order-api": { captureRuntimeRevision: () => ({ epoch: 1 }), isCurrentRuntimeRevision: () => true, subscribeRuntimeRevision: () => () => {} },
    "@/lib/exchange-scope-toast": { canShowExchangeToast }, "@/lib/exchange-input-amount": exchangeInput,
    "@/lib/remote-authority-coordinator": { createRemoteAuthorityCoordinator },
    "@/lib/remote-commerce-refresh": { refreshWalletAfterCommittedExchange: vi.fn() },
    "@/api/runtime": { remoteApiEnabled: true, exchangeApi: { fetchState, swap } },
    "@/store/exchange": { useExchange: () => ({ history: [], rate: 1 }) },
    "@/store/exchange-v3": { useExchangeV3: () => ({}), USER_DAILY_CAP_USD: 50, PLATFORM_DAILY_CAP_USD: 20000 },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected page import: ${id}`);
    return dependencies[id];
  }, exports);
  const root = node(), app = renderer.createApp(exports.default);
  app.mount(root); unmounts.push(() => app.unmount());
  const button = (label: string) => find(root, entry => entry.props.role === "button"
    && (entry.props["aria-label"] === label || textContent(entry) === label));
  const show = () => shown.forEach(callback => callback());
  show(); await flush();
  return {
    requests, fetchState, swap, confirm, navTo, show, button,
    hide: () => hidden.forEach(callback => callback()), text: () => textContent(root),
    enter: async (amount: string) => { find(root, entry => entry.tag === "input").props.onInput({ detail: { value: amount } }); await Vue.nextTick(); },
    amount: () => find(root, entry => entry.tag === "input").props.value,
    settle: async (value: ExchangeSnapshot) => { requests.at(-1)!.resolve(value); await flush(); },
  };
}
const insufficient = (sym: string) => en.exchange.insufficientMessage.replace("{sym}", sym);
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn() });
});
afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("mounted exchange balance authority", () => {
  it.each(["nex2usdt", "usdt2nex"])("retains input without false validation during pending, unavailable and recovery: %s", async direction => {
    const s = await mount(direction), sym = direction === "nex2usdt" ? "NEX" : "USDT";
    await s.settle(snapshot()); await s.enter("10");
    s.button(en.exchange.howItWorksEntry).props.onClick();
    expect(s.navTo).toHaveBeenCalledWith("/pages/me/wallet-exchange-how");
    s.hide(); s.show(); await flush();
    expect(s.amount()).toBe("10");
    expect(s.text()).toContain(en.wallet.loadingTransactions);
    expect(s.text()).toContain(en.exchange.remoteNotProvided);
    expect(s.text()).not.toContain(insufficient(sym));
    expect(s.text()).not.toContain(en.exchange.belowFee);
    expect(s.button(en.exchange.confirm).props["aria-disabled"]).toBe("true");
    s.requests.at(-1)!.reject(new Error("authority unavailable")); await flush();
    expect(s.text()).toContain(en.exchange.remoteUnavailableClosed);
    expect(s.text()).not.toContain(insufficient(sym));
    expect(s.text()).not.toContain(en.exchange.belowFee);
    s.button(en.exchange.confirm).props.onClick(); await flush();
    expect(s.confirm).not.toHaveBeenCalled(); expect(s.swap).not.toHaveBeenCalled();
    s.button(en.exchange.refreshRate).props.onClick(); await s.settle(snapshot());
    expect(s.amount()).toBe("10");
    expect(s.text()).toContain(en.exchange.swapPaused);
    expect(s.text()).not.toContain(insufficient(sym));
    s.button(en.exchange.confirm).props.onClick(); await flush();
    expect(s.button(en.exchange.confirm).props["aria-disabled"]).toBe("true");
    expect(s.confirm).not.toHaveBeenCalled(); expect(s.swap).not.toHaveBeenCalled();
  });

  it.each(["nex2usdt", "usdt2nex"])("still reports a ready low or zero balance and clears it when sufficient: %s", async direction => {
    const s = await mount(direction), sym = direction === "nex2usdt" ? "NEX" : "USDT";
    for (const balance of [2, 0]) {
      const state = snapshot(); state.caps.swapEnabled = true;
      state.wallet[direction === "nex2usdt" ? "nexAvailable" : "usdtAvailable"] = balance;
      await s.settle(state); await s.enter("10");
      expect(s.text()).toContain(insufficient(sym));
      expect(s.button(en.exchange.confirm).props["aria-disabled"]).toBe("true");
      s.button(en.exchange.refreshRate).props.onClick(); await flush();
    }
    const state = snapshot(); state.caps.swapEnabled = true; await s.settle(state);
    expect(s.text()).not.toContain(insufficient(sym));
    expect(s.button(en.exchange.confirm).props["aria-disabled"]).toBe("false");
  });

  it("preserves ready minimum and exchange-fee validation", async () => {
    const s = await mount(), state = snapshot(); state.caps.swapEnabled = true;
    await s.settle(state); await s.enter("5");
    const minimum = en.exchange.minAmount.replace("{n}", "10").replace("{sym}", "NEX");
    expect(s.text().split(minimum)).toHaveLength(3); // Pay-card hint plus validation.
    expect(s.text()).not.toContain(insufficient("NEX"));
    expect(s.button(en.exchange.confirm).props["aria-disabled"]).toBe("true");
    const feeState = snapshot(); feeState.caps.swapEnabled = true; feeState.caps.currentPrice = 0.01;
    s.button(en.exchange.refreshRate).props.onClick(); await s.settle(feeState); await s.enter("10");
    expect(s.text()).toContain(en.exchange.belowFee);
    expect(s.button(en.exchange.confirm).props["aria-disabled"]).toBe("true");
  });
});
