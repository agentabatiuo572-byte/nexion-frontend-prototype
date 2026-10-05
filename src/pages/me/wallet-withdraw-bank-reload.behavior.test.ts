import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { createBankWithdrawalApi, hasVerifiedBankIdentity } from "@/api/bank-withdrawal-api";
import { ApiError } from "@/api/errors";
import { parseServerTimestamp } from "@/api/server-time";
import { formatBankDateTime } from "@/lib/bank-date";
import * as bankState from "@/lib/bank-withdrawal-state";
import source from "./wallet-withdraw-bank.vue?raw";

vi.mock("@/store/trial-claim-sheet", () => ({ useTrialClaimSheet: () => ({ closeTransient: vi.fn() }) }));
vi.mock("@/store/voucher-claim-sheet", () => ({ useVoucherClaimSheet: () => ({ closeTransient: vi.fn() }) }));
vi.mock("@/store/ui", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/i18n/use-t", () => ({ getT: () => en }));
import { takeNavigationQuery } from "@/lib/route";

// Mount the production SFC with real bank response parsing and outcome logic.
// Only the SDK, transport, account store and presentation shells are controlled.
const { descriptor } = parse(source, { filename: "wallet-withdraw-bank.vue" });
const script = compileScript(descriptor, { id: "bank-reload", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text", "input"].includes(tag) } } });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[]; addEventListener: () => void; getRootNode: () => { activeElement: Host | null }; value?: string };
const node = (tag = "", text = ""): Host => ({ tag, text, props: {}, parent: null, children: [], addEventListener: () => {}, getRootNode: () => ({ activeElement: null }) });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: () => node("#comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); child.parent = null; },
});
const textOf = (target: Host): string => target.text + target.children.map(textOf).join("");
const nodesOf = (target: Host): Host[] => [target, ...target.children.flatMap(nodesOf)];
const orderNo = "WD-1A30347ECCC14C84BD820AEF2AF39449";
const bank = { quoteNo: `BQ-${"a".repeat(32)}`, amountUsdt: 21, feeUsdt: 1, netUsdt: 20, rateVnd: 25610,
  amountVnd: 512200, bankCode: "", bankName: "ACCOUNT_ROUTED", bankRoutingVerified: true,
  maskedAccount: "****1234", expiresAt: "2026-10-05T13:00:00Z" };
const paid = { state: "COMMITTED", withdrawalNo: orderNo, withdrawal: { withdrawalNo: orderNo, status: "CONFIRMED", chain: "BANK-VND" }, providerState: "PAID", bank,
  settlementEvidence: { status: "paid", evidenceRef: "test-evidence", providerOrderId: "test-provider",
    providerStatus: 3, checkedAt: "2026-10-05T12:00:00Z", amountUsdt: 21 } };
const config = { enabled: true, banks: [], unresolvedIntent: null, bankSelection: "ACCOUNT_ROUTED",
  beneficiary: { bankCode: "", bankName: "ACCOUNT_ROUTED", bankRoutingVerified: true, maskedAccount: "****1234",
    effectiveAt: "2026-10-01T00:00:00Z", nextChangeAt: "2026-10-06T00:00:00Z", canWithdraw: true },
  policy: { version: 1, minAmountUsd: 10, maxAmountUsd: 100, feeRatePct: 0, feeMinUsd: 1, feeMaxUsd: 1 },
  capacity: { maxWithdrawableUsdt: 80, dailyRemainingCount: 2, dailyLimitCount: 3,
    dailyCountResetAt: "2026-10-06T00:00:00Z", withdrawalEnabled: true } };
const cleanups: Array<() => void> = [];
async function settle() { for (let i = 0; i < 6; i++) { await Promise.resolve(); await Vue.nextTick(); } }

function mount(options: { params?: Record<string, unknown>; hash?: string; bootstrap?: boolean;
  firstFailure?: boolean; deferred?: boolean; pending?: boolean; unbound?: boolean; denyNewOwner?: number } = {}) {
  vi.stubGlobal("window", { location: { hash: options.hash ?? "#/pages/me/wallet-withdraw-bank" } });
  const storage = new Map<string, unknown>();
  const app = Vue.reactive({ accountKey: options.bootstrap ? "default" : "user:7", accountBindingEpoch: 0 });
  const hooks: Record<string, (...args: any[]) => void> = {};
  let runtimeRevision = 0, invalidateRuntime = () => {};
  let release!: (value: unknown) => void, rejectFirst!: (reason: unknown) => void;
  const firstRead = new Promise((resolve, reject) => { release = resolve; rejectFirst = reject; });
  const response = options.pending ? { ...paid, withdrawal: { ...paid.withdrawal, status: "PROCESSING" }, providerState: "PENDING", settlementEvidence: undefined } : paid;
  let orderReads = 0;
  const request = vi.fn(async (input: { path: string; method?: string; body?: unknown; idempotencyKey?: string }) => {
    if (input.method && input.method !== "GET") throw new Error("Unexpected funds mutation");
    if (input.path === "/api/withdrawals/bank/config") return { ...config, beneficiary: options.unbound ? null : config.beneficiary };
    if (input.path === `/api/withdrawals/bank/orders/${orderNo}`) {
      orderReads++;
      if (options.denyNewOwner && app.accountKey === "user:8") throw new ApiError({ kind: "http", status: options.denyNewOwner, message: "ORDER_NOT_FOUND" });
      if (options.firstFailure && orderReads === 1) throw new Error("AUTH_REQUIRED");
      if (options.deferred && orderReads === 1) return firstRead;
      return response;
    }
    throw new Error(`Unexpected bank request: ${input.path}`);
  });
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) });
  const presentation = { setup: (_props: unknown, { slots }: { slots: Vue.Slots }) => () => Vue.h("view", slots.default?.()) };
  const modules: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": Object.fromEntries(["onLoad", "onShow", "onHide", "onUnload"].map(name => [name, (fn: typeof invalidateRuntime) => { hooks[name] = fn; }])),
    "@/components/app-chassis.vue": { default: presentation }, "@/components/sub-page-header.vue": { default: { render: () => null } },
    "@/i18n/use-t": { useT: () => Vue.ref(en) }, "@/i18n/format": { dateLocale: () => "en-US" },
    "@/store/app": { useApp: () => app }, "@/api/runtime": { apiClient: { request } },
    "@/api/order-api": { captureRuntimeRevision: () => runtimeRevision, isCurrentRuntimeRevision: (value: number) => value === runtimeRevision,
      subscribeRuntimeRevision: (fn: () => void) => { invalidateRuntime = fn; return () => {}; } },
    "@/api/bank-withdrawal-api": { createBankWithdrawalApi, hasVerifiedBankIdentity },
    "@/api/server-time": { parseServerTimestamp }, "@/lib/bank-date": { formatBankDateTime },
    "@/lib/bank-withdrawal-state": bankState,
    "@/lib/route": { navBack: vi.fn(), navTo: vi.fn(), takeNavigationQuery },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected bank SFC dependency: ${name}`);
    return modules[name];
  }, exports);
  const root = node(), component = renderer.createApp(exports.default);
  component.mount(root); hooks.onLoad(options.params ?? {});
  cleanups.push(() => { hooks.onUnload(); component.unmount(); });
  const find = (id: string) => nodesOf(root).find(target => target.props["data-testid"] === id);
  return { app, request, release, rejectFirst, storage, root, find, text: () => textOf(root), show: () => hooks.onShow(),
    scope: () => ({ owner: app.accountKey, epoch: app.accountBindingEpoch, runtime: runtimeRevision }),
    runtime: () => { runtimeRevision++; invalidateRuntime(); },
    click: async (id: string) => { const target = find(id); if (!target) throw new Error(`Missing control: ${id}`); target.props.onClick(); await settle(); } };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  vi.stubGlobal("Document", class {}); vi.stubGlobal("ShadowRoot", class {});
});
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("bank order tracking reload", () => {
  it.each([
    ["warm onLoad", { params: { order: orderNo } }],
    ["cold H5 hash", { hash: `#/pages/me/wallet-withdraw-bank?order=${orderNo}` }],
    ["native deep link", { params: { order: orderNo }, hash: "" }],
    ["encoded H5 hash", { hash: `#/pages/me/wallet-withdraw-bank?order=${orderNo.replace("-", "%2D")}` }],
    ["warm params before a stale same-page hash", { params: { order: orderNo }, hash: "#/pages/me/wallet-withdraw-bank?order=WD-OTHER" }],
    ["duplicate query keeps its first value", { hash: `#/pages/me/wallet-withdraw-bank?order=${orderNo}&order=WD-OTHER` }],
  ])("reads the exact existing order once on %s", async (_name, options) => {
    const s = mount(options); s.show(); s.show(); await settle();
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual([`/api/withdrawals/bank/orders/${orderNo}`]);
    expect(textOf(s.find("bank-order-status")!)).toBe(en.bankWithdrawal.paid);
    expect(s.text()).toContain("512,200"); expect(s.text()).toContain("21 USDT");
    expect(s.find("bank-quote")).toBeUndefined();
  });

  it("retains the route order through cold account binding and retries the protected read", async () => {
    const s = mount({ params: { order: orderNo }, bootstrap: true, firstFailure: true });
    s.show(); await settle(); expect(s.text()).toContain(en.bankWithdrawal.error);
    s.app.accountKey = "user:7"; s.app.accountBindingEpoch++; await settle();
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual(Array(2).fill(`/api/withdrawals/bank/orders/${orderNo}`));
    expect(textOf(s.find("bank-order-status")!)).toBe(en.bankWithdrawal.paid);
  });

  it("coalesces the runtime listener and queued account watch for an identical in-flight order scope", async () => {
    const s = mount({ params: { order: orderNo } }); s.show(); await settle();
    const reads: Array<ReturnType<typeof s.scope>> = [];
    const releases: Array<(value: unknown) => void> = [];
    s.request.mockImplementation(() => {
      reads.push(s.scope()); return new Promise(resolve => releases.push(resolve));
    });
    s.app.accountKey = "user:8"; s.app.accountBindingEpoch++; s.runtime();
    try {
      await settle();
      expect(s.find("bank-order-status")).toBeUndefined(); expect(s.text()).not.toContain("512,200");
      expect(reads).toEqual([{ owner: "user:8", epoch: 1, runtime: 1 }]);
      s.show(); expect(reads).toHaveLength(1);
      releases[0](paid); await settle();
      expect(s.find("bank-order-status")).toBeDefined();
      expect(s.find("bank-refresh")?.props["aria-disabled"]).toBe(false);
    } finally { releases.forEach(resolve => resolve(paid)); await settle(); }
  });

  it.each([403, 404])("clears the old owner object and keeps a new owner's %s retryable", async status => {
    const s = mount({ params: { order: orderNo }, denyNewOwner: status }); s.show(); await settle();
    s.app.accountKey = "user:8"; s.app.accountBindingEpoch++; await settle();
    expect(s.find("bank-order-status")).toBeUndefined(); expect(s.text()).not.toContain("512,200");
    expect(s.text()).toContain(en.bankWithdrawal.error);
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual(Array(2).fill(`/api/withdrawals/bank/orders/${orderNo}`));
    expect(s.find("bank-continue")).toBeUndefined();
    await s.click("bank-refresh"); expect(s.find("bank-order-status")).toBeUndefined();
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual(Array(3).fill(`/api/withdrawals/bank/orders/${orderNo}`));
  });

  it.each([false, true])("rejects the previous account's late response or error (error=%s)", async rejected => {
    const s = mount({ params: { order: orderNo }, deferred: true, denyNewOwner: 404 }); s.show();
    s.app.accountKey = "user:8"; s.app.accountBindingEpoch++; await settle();
    if (rejected) s.rejectFirst(new Error("OLD_ACCOUNT_FAILED")); else s.release(paid);
    await settle();
    expect(s.find("bank-order-status")).toBeUndefined(); expect(s.text()).not.toContain("512,200");
    expect(s.text()).toContain(en.bankWithdrawal.error); expect(s.find("bank-continue")).toBeUndefined();
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual(Array(2).fill(`/api/withdrawals/bank/orders/${orderNo}`));
  });

  it("requeries the same order after runtime revision and rejects an older in-flight result", async () => {
    const s = mount({ params: { order: orderNo }, deferred: true }); s.show();
    s.runtime(); await settle(); expect(s.find("bank-order-status")).toBeDefined();
    s.release({ ...paid, bank: { ...bank, amountVnd: 999999 } }); await settle();
    expect(s.text()).toContain("512,200"); expect(s.text()).not.toContain("999,999");
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual(Array(2).fill(`/api/withdrawals/bank/orders/${orderNo}`));
  });

  it.each([false, true])("refreshes paid or pending orders without creating an intent (pending=%s)", async pending => {
    const s = mount({ hash: `#/pages/me/wallet-withdraw-bank?order=${orderNo}`, pending }); s.show(); await settle();
    expect(textOf(s.find("bank-order-status")!)).toBe(pending ? en.bankWithdrawal.processing : en.bankWithdrawal.paid);
    await s.click("bank-refresh");
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual(Array(2).fill(`/api/withdrawals/bank/orders/${orderNo}`));
    expect(!!s.find("bank-new")).toBe(!pending);
  });

  it("keeps an existing-order read failure retryable without showing a new withdrawal form", async () => {
    const s = mount({ hash: `#/pages/me/wallet-withdraw-bank?order=${orderNo}`, firstFailure: true }); s.show(); await settle();
    expect(s.text()).toContain(en.bankWithdrawal.error); expect(s.find("bank-continue")).toBeUndefined();
    await s.click("bank-refresh"); expect(s.find("bank-order-status")).toBeDefined();
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual(Array(2).fill(`/api/withdrawals/bank/orders/${orderNo}`));
  });

  it.each(["", "invalid", "WD-../other", [orderNo]])("fails closed for an invalid supplied order %s", async order => {
    const s = mount({ params: { order } }); s.show(); await settle();
    expect(s.request).not.toHaveBeenCalled(); expect(s.text()).toContain(en.bankWithdrawal.error);
    expect(s.find("bank-continue")).toBeUndefined(); expect(s.find("bank-quote")).toBeUndefined();
    await s.click("bank-refresh"); expect(s.request).not.toHaveBeenCalled();
  });

  it.each(["order=", "order=WD-%2E%2E%2Fother", `order=&order=${orderNo}`])("rejects invalid decoded/empty query input %s", async query => {
    const s = mount({ hash: `#/pages/me/wallet-withdraw-bank?${query}` }); s.show(); await settle();
    expect(s.request).not.toHaveBeenCalled(); expect(s.text()).toContain(en.bankWithdrawal.error);
    expect(s.find("bank-continue")).toBeUndefined();
  });

  it("ignores another page's hash and keeps the ordinary recipient/amount flow", async () => {
    const s = mount({ hash: `#/pages/me/wallet?order=${orderNo}` }); s.show(); await settle();
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual(["/api/withdrawals/bank/config"]);
    expect(s.find("bank-order-status")).toBeUndefined(); await s.click("bank-continue");
    expect(s.find("bank-amount")).toBeDefined(); expect(s.find("bank-quote")?.props["aria-disabled"]).toBe(true);
  });

  it("preserves the no-order unbound account flow", async () => {
    const s = mount({ unbound: true }); s.show(); await settle();
    expect(s.text()).toContain(en.bankWithdrawal.unboundNotice); expect(s.find("bank-continue")).toBeUndefined();
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual(["/api/withdrawals/bank/config"]);
  });

  it("lets explicit new withdrawal leave the route order without restoring it on a later show", async () => {
    const s = mount({ hash: `#/pages/me/wallet-withdraw-bank?order=${orderNo}` }); s.show(); await settle();
    await s.click("bank-new"); s.show(); await settle();
    expect(s.find("bank-order-status")).toBeUndefined(); expect(s.find("bank-continue")).toBeDefined();
    expect(s.request.mock.calls.map(([input]) => input.path)).toEqual([
      `/api/withdrawals/bank/orders/${orderNo}`, "/api/withdrawals/bank/config", "/api/withdrawals/bank/config",
    ]);
  });
});

// Explicit opt-in quote fixture; the original tracking fixture still rejects all non-GET requests.
function quoteFlow(s: ReturnType<typeof mount>, actions: {
  abandon: () => Promise<unknown>; recover?: () => unknown; submit?: () => Promise<unknown>;
}) {
  let intent: unknown = null;
  s.request.mockImplementation(async input => {
    if (input.path === "/api/withdrawals/bank/config" && !input.method) return { ...config, unresolvedIntent: intent };
    if (input.path === "/api/withdrawals/bank/quotes" && input.method === "POST") {
      expect(input.body).toEqual({ amountUsdt: "21" });
      intent = { state: "NOT_SUBMITTED", quoteNo: bank.quoteNo, withdrawalNo: null,
        intents: [{ state: "NOT_SUBMITTED", quoteNo: bank.quoteNo, withdrawalNo: null, expiresAt: bank.expiresAt, providerState: null }] };
      return bank;
    }
    if (input.path === `/api/withdrawals/bank/quotes/${bank.quoteNo}/abandon` && input.method === "POST") {
      const receipt = await actions.abandon();
      if ((receipt as { state: string }).state === "ABANDONED" || (receipt as { state: string }).state === "EXPIRED") intent = null;
      return receipt;
    }
    if (input.path === `/api/withdrawals/bank/quotes/${bank.quoteNo}` && !input.method)
      return actions.recover?.() ?? { state: "NOT_SUBMITTED", quote: bank };
    if (input.path === "/api/withdrawals/bank/orders" && input.method === "POST" && actions.submit) {
      expect(input.body).toEqual({ quoteNo: bank.quoteNo });
      expect(input.idempotencyKey).toBe(`bank-submit:${bank.quoteNo}`);
      expect(s.storage.get("nexgrid.bank-withdraw.pending:user:7")).toBe(bank.quoteNo);
      return actions.submit();
    }
    throw new Error(`Unexpected quote fixture request: ${input.method ?? "GET"} ${input.path}`);
  });
}
async function showQuote(s: ReturnType<typeof mount>) {
  s.show(); await settle(); await s.click("bank-continue");
  s.find("bank-amount")!.props["onUpdate:modelValue"]("21"); await settle();
  await s.click("bank-quote");
  expect(s.find("bank-consent")?.props["aria-checked"]).toBe(false);
  expect(s.find("bank-submit")?.props["aria-disabled"]).toBe(true);
}
function press(control: Host, key: string) {
  const handlers = control.props.onKeydown;
  for (const handler of Array.isArray(handlers) ? handlers : [handlers]) handler({ key, preventDefault() {} });
}
const pathsOf = (s: ReturnType<typeof mount>) => s.request.mock.calls.map(([input]) => input.path);

describe("bank quote cancellation loading", () => {
  it.each(["ABANDONED", "EXPIRED"])("shows only loading while cancellation is pending, then restores the amount for %s", async state => {
    const s = mount(); quoteFlow(s, { abandon: () => new Promise(resolve => { s.release = resolve; }) });
    await showQuote(s); const cancel = s.find("bank-abandon")!;
    await s.click("bank-abandon");
    expect(s.text()).toContain(en.bankWithdrawal.loading);
    expect(s.text()).not.toContain(en.bankWithdrawal.unknown);
    expect(s.find("bank-refresh")?.props["aria-disabled"]).toBe(true);
    expect(s.find("bank-submit")).toBeUndefined(); expect(s.find("bank-quote")).toBeUndefined();
    const beforeRepeatedActivation = pathsOf(s);
    cancel.props.onClick(); press(cancel, "Enter"); press(cancel, " "); await s.click("bank-refresh");
    expect(pathsOf(s)).toEqual(beforeRepeatedActivation);
    s.release({ state }); await settle();
    expect(s.find("bank-amount")?.value).toBe("21");
    expect(s.find("bank-quote")?.props["aria-disabled"]).toBe(false);
    expect(s.text()).not.toContain(en.bankWithdrawal.unknown);
    expect(pathsOf(s)).toEqual(["/api/withdrawals/bank/config", "/api/withdrawals/bank/quotes",
      `/api/withdrawals/bank/quotes/${bank.quoteNo}/abandon`, "/api/withdrawals/bank/config"]);
    expect(s.storage.size).toBe(0);
  });

  it("lets the committed original order win a cancellation race without creating another order", async () => {
    const s = mount(); quoteFlow(s, { abandon: () => new Promise(resolve => { s.release = resolve; }) });
    await showQuote(s); await s.click("bank-abandon");
    s.release(paid); await settle();
    expect(textOf(s.find("bank-order-status")!)).toBe(en.bankWithdrawal.paid);
    expect(s.text()).toContain(orderNo); expect(s.find("bank-amount")).toBeUndefined();
    expect(s.find("bank-submit")).toBeUndefined();
    expect(pathsOf(s)).toEqual(["/api/withdrawals/bank/config", "/api/withdrawals/bank/quotes",
      `/api/withdrawals/bank/quotes/${bank.quoteNo}/abandon`]);
  });

  it.each(["NOT_SUBMITTED", "COMMITTED"])("keeps a failed cancellation fenced and reads back the same quote as %s", async state => {
    const s = mount(); quoteFlow(s, { abandon: () => new Promise((_resolve, reject) => { s.rejectFirst = reject; }),
      recover: () => state === "COMMITTED" ? paid : { state: "NOT_SUBMITTED", quote: bank } });
    await showQuote(s); await s.click("bank-abandon");
    s.rejectFirst(new ApiError({ kind: "network", message: "CANCEL_RECEIPT_LOST", retryable: true })); await settle();
    expect(s.text()).toContain(en.bankWithdrawal.error); expect(s.text()).toContain(en.bankWithdrawal.unknown);
    expect(s.find("bank-refresh")?.props["aria-disabled"]).toBe(false);
    expect(s.find("bank-quote")).toBeUndefined(); expect(s.find("bank-submit")).toBeUndefined();
    await s.click("bank-refresh");
    expect(pathsOf(s)).toEqual(["/api/withdrawals/bank/config", "/api/withdrawals/bank/quotes",
      `/api/withdrawals/bank/quotes/${bank.quoteNo}/abandon`, "/api/withdrawals/bank/config",
      `/api/withdrawals/bank/quotes/${bank.quoteNo}`]);
    if (state === "COMMITTED") {
      expect(s.text()).toContain(orderNo); expect(s.find("bank-amount")).toBeUndefined();
    } else {
      expect(s.find("bank-consent")?.props["aria-checked"]).toBe(false);
      expect(s.find("bank-submit")?.props["aria-disabled"]).toBe(true);
    }
    expect(s.storage.size).toBe(0);
  });

  it("retains true submit uncertainty and the durable original quote/key after a lost receipt", async () => {
    const s = mount(); quoteFlow(s, { abandon: async () => { throw new Error("Unexpected cancellation"); },
      submit: () => new Promise((_resolve, reject) => { s.rejectFirst = reject; }), recover: () => paid });
    await showQuote(s); await s.click("bank-consent");
    const submit = s.find("bank-submit")!; await s.click("bank-submit");
    expect(s.storage.get("nexgrid.bank-withdraw.pending:user:7")).toBe(bank.quoteNo);
    submit.props.onClick(); press(submit, "Enter"); press(submit, " "); await settle();
    expect(pathsOf(s).filter(path => path === "/api/withdrawals/bank/orders")).toHaveLength(1);
    s.rejectFirst(new ApiError({ kind: "network", message: "SUBMIT_RECEIPT_LOST", retryable: true })); await settle();
    expect(s.text()).toContain(en.bankWithdrawal.unknown); expect(s.find("bank-submit")).toBeUndefined();
    expect(s.storage.get("nexgrid.bank-withdraw.pending:user:7")).toBe(bank.quoteNo);
    await s.click("bank-refresh");
    expect(s.text()).toContain(orderNo); expect(s.storage.size).toBe(0);
    expect(pathsOf(s)).toEqual(["/api/withdrawals/bank/config", "/api/withdrawals/bank/quotes",
      "/api/withdrawals/bank/orders", `/api/withdrawals/bank/quotes/${bank.quoteNo}`]);
  });
});
