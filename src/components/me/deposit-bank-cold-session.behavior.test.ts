import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import ts from "typescript";
import paneSource from "./deposit-bank-pane.vue?raw";
import fxSource from "./fx-rate-line.vue?raw";
import { createApiClient } from "@/api/api-client";
import { createPaymentApi } from "@/api/payment-api";
import { createSessionVault } from "@/api/session-vault";
import { ApiError } from "@/api/errors";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { computeQuoteRate, fmtVnd, vndForUsdt } from "@/store/fx-core";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { remoteAccountScope } from "@/lib/remote-account-epoch";
import { findResumablePaymentIntent } from "@/lib/hosted-payment";
import { runRecoverableFundsOperation } from "@/lib/recoverable-funds-operation";
import { buildVietQrTransferSteps } from "@/lib/vietqr-remote-safety";
import type { DepositIntent } from "@/store/types";

const runtime = vi.hoisted(() => ({ remoteApiEnabled: true, sessionVault: { read: vi.fn() },
  paymentApi: { config: vi.fn(), fxQuote: vi.fn() } }));
vi.mock("@/api/runtime", () => runtime);
const { useFx } = await import("@/store/fx");
const now = Date.parse("2026-10-04T00:39:20Z"), quoteRate = computeQuoteRate(26000, 1.5);
const cleanups: Array<() => void> = [];

function component(source: string, modules: Record<string, unknown>, components = {}) {
  const descriptor = parse(source).descriptor;
  const ast = ts.createSourceFile("component.ts", descriptor.scriptSetup!.content, ts.ScriptTarget.ES2022, true);
  const exposed = ast.statements.flatMap(statement => ts.isFunctionDeclaration(statement)
    ? statement.name ? [statement.name.text] : []
    : ts.isVariableStatement(statement) ? statement.declarationList.declarations.flatMap(declaration =>
      ts.isIdentifier(declaration.name) ? [declaration.name.text] : []) : []);
  const script = ts.transpileModule(descriptor.scriptSetup!.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText + `;return { ${exposed.join(", ")} };`;
  const render = new Function("Vue", compile(descriptor.template!.content, {
    mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
  }).code)(Vue) as Vue.RenderFunction;
  let state: Record<string, unknown> = {};
  return { definition: { components, render, setup: () => {
    state = new Function("require", "exports", script)((name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected payment dependency: ${name}`);
      return modules[name];
    }, {}) as Record<string, unknown>;
    return { ...state, fmt, fmtVnd };
  } }, state: () => state };
}

// Vue's real renderer mounts both real templates and manages their watches/lifecycles.
// This tiny host only replaces DOM I/O; no component logic or branches are mirrored.
interface HostNode { kind: string; text: string; props: Record<string, unknown>; children: HostNode[]; parent: HostNode | null }
const node = (kind: string, text = ""): HostNode => ({ kind, text, props: {}, children: [], parent: null });
function remove(child: HostNode) {
  if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
  child.parent = null;
}
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: text => node("#comment", text),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, next) => { target.props[key] = next; },
  insert: (child, parent, anchor) => {
    remove(child); child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  }, remove, parentNode: target => target.parent,
  nextSibling: target => target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
});
const textOf = (target: HostNode): string => (target.kind === "#comment" ? "" : target.text) + target.children.map(textOf).join("");

function harness(options: { warm?: boolean; quoteFailure?: boolean; existing?: boolean;
  deferFirstQuote?: boolean; firstIntentFailure?: boolean } = {}) {
  const vault = createSessionVault(), auth = Vue.reactive({ isAuthenticated: false, accountId: "user:7" });
  const app = Vue.reactive({ accountKey: "default", accountBindingEpoch: 0 });
  runtime.sessionVault.read.mockImplementation(() => vault.read());
  let releaseFirstQuote!: (fail?: boolean) => void;
  const firstQuote = new Promise<void>((resolve, reject) => {
    releaseFirstQuote = fail => fail ? reject(new Error("OLD_ACCOUNT_QUOTE_FAILED")) : resolve();
  });
  let intentReads = 0;
  const snapshot = (userId = 7) => ({ accessToken: "test-access", refreshToken: "test-refresh", tokenType: "Bearer",
    user: { userId, countryCode: "+86", phone: "13800000007", nickname: "Test", onboardingComplete: true } });
  const original: DepositIntent = { intentId: "VQR-existing-10", usdtAmount: 10, fxRate: quoteRate,
    vndAmount: vndForUsdt(10, quoteRate), status: "awaiting_payment", createdAt: now, expireAt: now + 30 * 60_000,
    paymentMode: "hosted", providerStatus: "created", paymentUrl: "https://api.hdpayadmin.com/pay?id=existing" };
  const transport = vi.fn(async (request: { method: string; url: string }) => {
    if (request.method !== "GET") throw new Error("Unexpected payment mutation");
    const path = new URL(request.url).pathname;
    const userId = vault.read()?.user.userId;
    const baseRate = userId === 8 ? 27000 : 26000;
    const remainingUsdt = userId === 8 ? 80 : 100;
    let data: unknown;
    if (path.endsWith("/payments/config")) data = { serverCanonical: true, source: "nx_vietqr_config",
      sourceEnvironment: "PRODUCTION", runId: "", vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
        todayRemainingDepositUsdt: remainingUsdt, todayRemainingVnd: vndForUsdt(remainingUsdt, computeQuoteRate(baseRate, 1.5)), dailyCapacityKnown: true,
        toleranceVnd: 1000, graceMinutes: 10, version: 1, feeVnd: 0, feeUsdt: 0 } };
    else if (path.endsWith("/payments/fx-quote")) {
      if (options.deferFirstQuote && userId === 7) await firstQuote;
      if (options.quoteFailure) return { status: 503, data: { code: 503, message: "FX_UNAVAILABLE", data: null }, headers: {} };
      data = { serverCanonical: true, source: "nx_finance_fx_quote_config", sourceEnvironment: "PRODUCTION", runId: "",
        baseRateVndPerUsdt: baseRate, buySpreadPct: 1.5, quoteRateVndPerUsdt: computeQuoteRate(baseRate, 1.5), lockWindowMinutes: 30, version: 1,
        asOf: new Date(now).toISOString() };
    } else if (path.endsWith("/deposits/vietqr/intents")) {
      if (++intentReads === 1 && options.firstIntentFailure) {
        return { status: 503, data: { code: 503, message: "READ_FAILED", data: null }, headers: {} };
      }
      data = { items: options.existing === false ? [] : [original] };
    }
    else throw new Error(`Unexpected payment read: ${path}`);
    return { status: 200, data: { code: 0, message: "OK", data }, headers: {} };
  });
  const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: transport } });
  const api = createPaymentApi(client, "dev");
  runtime.paymentApi.config.mockImplementation(() => api.config());
  runtime.paymentApi.fxQuote.mockImplementation(() => api.fxQuote());
  const dep = Vue.reactive({ intents: [] as DepositIntent[], records: [], serverStatus: "idle", serverError: "",
    currentAccountKey: () => app.accountKey, createRemoteBankIntent: vi.fn(), startRemoteVietQrPolling: vi.fn(),
    stopRemoteVietQrPolling: vi.fn(), refreshRemoteVietQrDeposits: vi.fn(async (): Promise<void> => {
      try {
        const result = await client.request<{ items: DepositIntent[] }>({ path: "/api/app/deposits/vietqr/intents" });
        dep.intents = result.items; dep.serverStatus = "ready"; dep.serverError = "";
      } catch (cause) { dep.serverStatus = "error"; dep.serverError = cause instanceof Error ? cause.message : "READ_FAILED"; }
    }) });
  const fx = useFx(), open = vi.fn(), navTo = vi.fn();
  const modules: Record<string, unknown> = {
    vue: Vue, "@/store/fx": { useFx: () => fx }, "@/store/app": { useApp: () => app },
    "@/store/auth": { useAuth: () => auth }, "@/store/deposits": { useDeposits: () => dep },
    "@/api/runtime": { remoteApiEnabled: true, sessionVault: vault }, "@/api/errors": { ApiError },
    "@/lib/binary-session-ready": { binarySessionReady }, "@/i18n/use-t": { useT: () => Vue.ref(zh) },
    "@/i18n/format": { fmt }, "@/store/fx-core": { fmtVnd, vndForUsdt },
    "@/composables/use-dialog-a11y": { useDialogA11y: () => {} }, "@/components/me/fx-rate-line.vue": {},
    "@/lib/route": { navBack: vi.fn(), navTo }, "@/store/ui": { toast: { error: vi.fn(), warn: vi.fn(), success: vi.fn() }, confirm: vi.fn() },
    "@/store/server-time": { mockServerNow: () => now }, "@/store/deposits-core": { BANK_MAX_DEPOSIT_USDT: 5000, MIN_DEPOSIT_USDT: 10 },
    "@/lib/recoverable-funds-operation": { runRecoverableFundsOperation },
    "@/lib/vietqr-remote-safety": { buildVietQrTransferSteps },
    "@/lib/hosted-payment": { findResumablePaymentIntent, openHostedPaymentPage: open },
  };
  const line = component(fxSource, modules), pane = component(paneSource, modules, { FxRateLine: line.definition });
  const restore = (userId = 7, boundUserId = 7) => { vault.save(snapshot(userId)); auth.isAuthenticated = true;
    auth.accountId = `user:${boundUserId}`; app.accountKey = auth.accountId;
    remoteAccountScope.bind(app.accountKey); app.accountBindingEpoch++; };
  if (options.warm) restore();
  const root = node("root"), mounted = renderer.createApp(pane.definition);
  mounted.mount(root);
  let disposed = false;
  const unmount = () => { if (!disposed) { disposed = true; mounted.unmount(); } };
  cleanups.push(unmount);
  return { app, auth, vault, restore, dep, fx, open, transport, client, releaseFirstQuote,
    state: pane.state, text: () => textOf(root), unmount };
}

beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  remoteAccountScope.bind("default");
  vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.useRealTimers(); vi.restoreAllMocks(); });

test("cold startup waits for a matching bound session, then both real templates recover the original order without a rail switch", async () => {
  const h = harness(); await Vue.nextTick();
  expect(h.transport).not.toHaveBeenCalled(); expect(runtime.paymentApi.config).not.toHaveBeenCalled();
  expect(h.dep.refreshRemoteVietQrDeposits).not.toHaveBeenCalled(); expect(h.dep.startRemoteVietQrPolling).not.toHaveBeenCalled();
  expect(h.text()).not.toContain(zh.bankPane.railPaused); expect(h.text()).not.toContain(zh.topupChrome.depositOpFailedNote);
  await expect(h.client.request({ path: "/api/app/payments/config" })).rejects.toMatchObject({ message: "AUTH_SESSION_REQUIRED" });
  expect(h.transport).not.toHaveBeenCalled();
  h.restore(); await Vue.nextTick(); await vi.waitFor(() => expect(h.fx.fxAvailable).toBe(true)); await Vue.nextTick();
  expect(h.text()).toContain(fmt(zh.fx.rateValue, { vnd: fmtVnd(quoteRate) }));
  expect(h.dep.intents[0]).toMatchObject({ intentId: "VQR-existing-10", providerStatus: "created", status: "awaiting_payment" });
  expect(h.text()).toContain(zh.bankPane.hostedContinueCta); expect(h.text()).not.toContain(zh.topupChrome.depositOpFailedNote);
  expect(runtime.paymentApi.config).toHaveBeenCalledTimes(1); expect(runtime.paymentApi.fxQuote).toHaveBeenCalledTimes(1);
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
  expect(h.transport.mock.calls.every(([request]) => request.method === "GET")).toBe(true);
});

test("a warm entry loads once and a same-account rebind remounts the real rate component once", async () => {
  const h = harness({ warm: true }); await vi.waitFor(() => expect(h.fx.configReady).toBe(true));
  expect(runtime.paymentApi.config).toHaveBeenCalledTimes(1);
  h.app.accountBindingEpoch++; await Vue.nextTick(); await vi.waitFor(() => expect(runtime.paymentApi.config).toHaveBeenCalledTimes(2));
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});

test("an actual post-restore quote failure stays closed without local fallback or automatic retry", async () => {
  const h = harness({ quoteFailure: true, existing: false }); h.restore(); await Vue.nextTick();
  await vi.waitFor(() => expect(h.fx.syncFailed).toBe(true)); await Vue.nextTick();
  expect(h.fx).toMatchObject({ configReady: false, fxAvailable: false, baseRateVndPerUsdt: 0, maxDepositUsdt: 0, vietQrEnabled: false });
  expect(h.text()).toContain(zh.fx.updating);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(runtime.paymentApi.config).toHaveBeenCalledTimes(1); expect(runtime.paymentApi.fxQuote).toHaveBeenCalledTimes(1);
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled();
});

test("a late session restore cannot load a bank pane that was unmounted", async () => {
  const h = harness(); h.unmount(); h.restore(); await Vue.nextTick(); await Promise.resolve();
  expect(h.transport).not.toHaveBeenCalled(); expect(h.dep.startRemoteVietQrPolling).not.toHaveBeenCalled();
});

test("a vault from another identity cannot unlock payment reads", async () => {
  const h = harness(); h.restore(8); await Vue.nextTick(); await Promise.resolve();
  expect(h.transport).not.toHaveBeenCalled(); expect(runtime.paymentApi.config).not.toHaveBeenCalled();
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled();
});

test.each([false, true])("a ready rebind starts the new account's read while the prior quote is pending (old failure=%s)", async (failOld) => {
  const h = harness({ warm: true, deferFirstQuote: true, existing: false });
  await Vue.nextTick(); expect(runtime.paymentApi.fxQuote).toHaveBeenCalledTimes(1);
  const oldLoad = h.fx.load();
  h.restore(8, 8); await Vue.nextTick();
  await vi.waitFor(() => expect(h.fx.configReady).toBe(true));
  expect(runtime.paymentApi.config).toHaveBeenCalledTimes(2); expect(runtime.paymentApi.fxQuote).toHaveBeenCalledTimes(2);
  expect(h.fx).toMatchObject({ baseRateVndPerUsdt: 27000, todayRemainingDepositUsdt: 80, loading: false, syncFailed: false });
  h.releaseFirstQuote(failOld); await oldLoad; await Vue.nextTick();
  expect(h.fx).toMatchObject({ configReady: true, baseRateVndPerUsdt: 27000,
    todayRemainingDepositUsdt: 80, loading: false, syncFailed: false });
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});

test("a late read failure cannot write a banner after the pane was unmounted", async () => {
  const h = harness({ warm: true });
  let release!: () => void;
  h.dep.refreshRemoteVietQrDeposits.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  await Vue.nextTick(); expect(h.dep.refreshRemoteVietQrDeposits).toHaveBeenCalledTimes(1);
  h.unmount(); h.dep.serverStatus = "error"; h.dep.serverError = "READ_FAILED";
  release(); await Promise.resolve(); await Vue.nextTick();
  expect((h.state().createError as Vue.Ref<string>).value).toBe("");
  expect((h.state().readError as Vue.Ref<string>).value).toBe("");
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled();
});

test("the first read failure clears after a later successful read without a remount or another FX load", async () => {
  const h = harness({ warm: true, firstIntentFailure: true });
  await vi.waitFor(() => expect(h.dep.serverStatus).toBe("error")); await Vue.nextTick();
  expect((h.state().readError as Vue.Ref<string>).value).toBe(zh.topupChrome.depositOpFailedNote);
  expect((h.state().createError as Vue.Ref<string>).value).toBe("");
  expect(h.text()).toContain(zh.topupChrome.depositOpFailedNote);
  await h.dep.refreshRemoteVietQrDeposits(); await Vue.nextTick();
  expect((h.state().readError as Vue.Ref<string>).value).toBe("");
  expect(h.text()).not.toContain(zh.topupChrome.depositOpFailedNote);
  expect(h.text()).toContain(zh.bankPane.hostedContinueCta);
  expect(runtime.paymentApi.config).toHaveBeenCalledTimes(1); expect(runtime.paymentApi.fxQuote).toHaveBeenCalledTimes(1);
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});

test.each(["HDPAY_ORDER_CREATE_REJECTED", "CREATE_TEMPORARILY_UNAVAILABLE"])(
  "a successful read clears only its read banner and preserves the actual %s CREATE error", async (message) => {
    const h = harness({ warm: true, firstIntentFailure: true, existing: false });
    await vi.waitFor(() => expect(h.fx.configReady && h.dep.serverStatus === "error").toBe(true)); await Vue.nextTick();
    h.dep.createRemoteBankIntent.mockRejectedValue(new ApiError({ kind: "business", status: 422, message }));
    const complete = h.state().completeCreateOrder as (amount: number, account: string) => Promise<void>;
    await complete(25, "user:7"); await Vue.nextTick();
    const expected = message === "HDPAY_ORDER_CREATE_REJECTED" ? zh.bankPane.hostedRejectedNote : zh.topupChrome.depositOpFailedNote;
    expect((h.state().createError as Vue.Ref<string>).value).toBe(expected);
    await h.dep.refreshRemoteVietQrDeposits(); await Vue.nextTick();
    expect((h.state().readError as Vue.Ref<string>).value).toBe("");
    expect((h.state().createError as Vue.Ref<string>).value).toBe(expected); expect(h.text()).toContain(expected);
    expect(h.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(25, "user:7");
    expect(h.transport.mock.calls.every(([request]) => request.method === "GET")).toBe(true); expect(h.open).not.toHaveBeenCalled();
  },
);

test("an old binding's late read callback cannot add a banner over the current account's actual create error", async () => {
  const h = harness({ warm: true, existing: false });
  let release!: () => void;
  h.dep.refreshRemoteVietQrDeposits.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  await Vue.nextTick(); expect(h.dep.refreshRemoteVietQrDeposits).toHaveBeenCalledTimes(1);
  h.restore(8, 8); await Vue.nextTick();
  await vi.waitFor(() => expect(h.fx.configReady && h.dep.serverStatus === "ready").toBe(true));
  const complete = h.state().completeCreateOrder as (amount: number, account: string) => Promise<void>;
  await complete(9, "user:8");
  const currentCreateError = (h.state().createError as Vue.Ref<string>).value;
  expect(currentCreateError).toBe(fmt(zh.bankPane.minimumLimitExceeded, { min: "$10" }));
  h.dep.serverStatus = "error"; h.dep.serverError = "OLD_READ_FAILED"; release();
  await Promise.resolve(); await Vue.nextTick();
  expect((h.state().readError as Vue.Ref<string>).value).toBe("");
  expect((h.state().createError as Vue.Ref<string>).value).toBe(currentCreateError);
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled();
});

test("an invalidated session removes only the stale read banner and keeps the actual create validation error", async () => {
  const h = harness({ warm: true, firstIntentFailure: true, existing: false });
  await vi.waitFor(() => expect(h.fx.configReady && h.dep.serverStatus === "error").toBe(true)); await Vue.nextTick();
  const complete = h.state().completeCreateOrder as (amount: number, account: string) => Promise<void>;
  await complete(9, "user:7");
  expect((h.state().readError as Vue.Ref<string>).value).toBe(zh.topupChrome.depositOpFailedNote);
  const createError = (h.state().createError as Vue.Ref<string>).value;
  expect(createError).toBe(fmt(zh.bankPane.minimumLimitExceeded, { min: "$10" }));
  const readCount = h.transport.mock.calls.length;
  h.auth.isAuthenticated = false; await Vue.nextTick();
  expect((h.state().readError as Vue.Ref<string>).value).toBe("");
  expect((h.state().createError as Vue.Ref<string>).value).toBe(createError);
  expect(h.transport).toHaveBeenCalledTimes(readCount); expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled();
});
