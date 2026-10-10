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
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { computeQuoteRate, fmtVnd, vndForUsdt } from "@/store/fx-core";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { remoteAccountScope } from "@/lib/remote-account-epoch";
import { findResumablePaymentIntent, validateHostedPaymentUrl } from "@/lib/hosted-payment";
import { runRecoverableFundsOperation } from "@/lib/recoverable-funds-operation";
import { buildVietQrTransferSteps } from "@/lib/vietqr-remote-safety";
import type { DepositIntent, DepositRecord } from "@/store/types";

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
const nodesOf = (target: HostNode): HostNode[] => [target, ...target.children.flatMap(nodesOf)];
const control = (root: HostNode, className: string) => nodesOf(root).find(target => String(target.props.class).split(" ").includes(className));

function harness(options: { warm?: boolean; quoteFailure?: boolean; existing?: boolean;
  deferFirstQuote?: boolean; firstIntentFailure?: boolean; initialIntents?: DepositIntent[];
  cachedIntents?: DepositIntent[]; deferFirstIntentRead?: boolean; translations?: typeof zh } = {}) {
  const vault = createSessionVault(), auth = Vue.reactive({ isAuthenticated: false, accountId: "user:7" });
  const app = Vue.reactive({ accountKey: "default", accountBindingEpoch: 0 });
  runtime.sessionVault.read.mockImplementation(() => vault.read());
  let releaseFirstQuote!: (fail?: boolean) => void;
  const firstQuote = new Promise<void>((resolve, reject) => {
    releaseFirstQuote = fail => fail ? reject(new Error("OLD_ACCOUNT_QUOTE_FAILED")) : resolve();
  });
  let intentReads = 0;
  let releaseFirstIntentRead!: () => void;
  const firstIntentRead = new Promise<void>(resolve => { releaseFirstIntentRead = resolve; });
  const snapshot = (userId = 7) => ({ accessToken: "test-access", refreshToken: "test-refresh", tokenType: "Bearer",
    user: { userId, countryCode: "+86", phone: "13800000007", nickname: "Test", onboardingComplete: true } });
  const original: DepositIntent = { intentId: "VQR-existing-10", usdtAmount: 10, fxRate: quoteRate,
    vndAmount: vndForUsdt(10, quoteRate), status: "awaiting_payment", createdAt: now, expireAt: now + 30 * 60_000,
    paymentMode: "hosted", providerStatus: "created", paymentUrl: "https://api.hdpayadmin.com/pay?id=existing" };
  let canonicalIntents = options.initialIntents ?? (options.existing === false ? [] : [original]);
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
      const firstRead = ++intentReads === 1;
      if (firstRead && options.deferFirstIntentRead) await firstIntentRead;
      if (firstRead && options.firstIntentFailure) {
        return { status: 503, data: { code: 503, message: "READ_FAILED", data: null }, headers: {} };
      }
      data = { items: canonicalIntents.map(item => ({ ...item })) };
    }
    else throw new Error(`Unexpected payment read: ${path}`);
    return { status: 200, data: { code: 0, message: "OK", data }, headers: {} };
  });
  const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: transport } });
  const api = createPaymentApi(client, "dev");
  runtime.paymentApi.config.mockImplementation(() => api.config());
  runtime.paymentApi.fxQuote.mockImplementation(() => api.fxQuote());
  const dep = Vue.reactive({ intents: options.cachedIntents ?? [] as DepositIntent[], records: [] as DepositRecord[],
    remoteReceipts: [] as Array<{ intentNo: string }>, serverStatus: options.cachedIntents ? "ready" : "idle", serverError: "",
    remoteReceiptInitialStatus: options.cachedIntents ? "ready" : "idle", remoteReceiptMoreStatus: "idle",
    currentAccountKey: () => app.accountKey, createRemoteBankIntent: vi.fn(), startRemoteVietQrPolling: vi.fn(),
    stopRemoteVietQrPolling: vi.fn(), refreshRemoteVietQrDeposits: vi.fn(async (): Promise<void> => {
      dep.remoteReceiptInitialStatus = "loading";
      dep.serverStatus = "loading";
      try {
        const result = await client.request<{ items: DepositIntent[] }>({ path: "/api/app/deposits/vietqr/intents" });
        dep.intents = result.items; dep.remoteReceiptInitialStatus = "ready"; dep.serverStatus = "ready"; dep.serverError = "";
      } catch (cause) { dep.remoteReceiptInitialStatus = "error"; dep.serverStatus = "error";
        dep.serverError = cause instanceof Error ? cause.message : "READ_FAILED"; }
    }) });
  const fx = useFx(), open = vi.fn(), navTo = vi.fn();
  const modules: Record<string, unknown> = {
    vue: Vue, "@/store/fx": { useFx: () => fx }, "@/store/app": { useApp: () => app },
    "@/store/auth": { useAuth: () => auth }, "@/store/deposits": { useDeposits: () => dep },
    "@/api/runtime": { remoteApiEnabled: true, sessionVault: vault }, "@/api/errors": { ApiError },
    "@/lib/binary-session-ready": { binarySessionReady }, "@/i18n/use-t": { useT: () => Vue.ref(options.translations ?? zh) },
    "@/i18n/format": { fmt }, "@/store/fx-core": { fmtVnd, vndForUsdt },
    "@/composables/use-dialog-a11y": { useDialogA11y: () => {} }, "@/components/me/fx-rate-line.vue": {},
    "@/lib/route": { navBack: vi.fn(), navTo }, "@/store/ui": { toast: { error: vi.fn(), warn: vi.fn(), success: vi.fn() }, confirm: vi.fn() },
    "@/store/server-time": { mockServerNow: () => now }, "@/store/deposits-core": { BANK_MAX_DEPOSIT_USDT: 5000, MIN_DEPOSIT_USDT: 10 },
    "@/lib/recoverable-funds-operation": { runRecoverableFundsOperation },
    "@/lib/vietqr-remote-safety": { buildVietQrTransferSteps },
    "@/lib/hosted-payment": { findResumablePaymentIntent, validateHostedPaymentUrl, openHostedPaymentPage: open },
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
  return { root, app, auth, vault, restore, dep, fx, open, transport, client, releaseFirstQuote, releaseFirstIntentRead,
    setCanonicalIntents: (items: DepositIntent[]) => { canonicalIntents = items; },
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

test("a coalesced initial read still reports failure when its caller returns before the shared read", async () => {
  const h = harness({ warm: true });
  h.dep.refreshRemoteVietQrDeposits.mockImplementationOnce(async () => {
    h.dep.remoteReceiptInitialStatus = "loading";
    h.dep.serverStatus = "loading";
  });
  await Vue.nextTick(); await Promise.resolve(); await Vue.nextTick();
  expect((h.state().readError as Vue.Ref<string>).value).toBe("");
  h.dep.remoteReceiptInitialStatus = "error";
  h.dep.serverStatus = "error";
  h.dep.serverError = "INTENTS_READ_FAILED";
  await Vue.nextTick();
  expect((h.state().readError as Vue.Ref<string>).value).toBe(zh.topupChrome.depositOpFailedNote);
  expect(h.text()).toContain(zh.topupChrome.depositOpFailedNote);
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
    const expected = message === "HDPAY_ORDER_CREATE_REJECTED" ? zh.bankPane.hostedRejectedNote : zh.bankPane.createFailedNote;
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

const oldAttempt: DepositIntent = { intentId: "VQR-old-4998", usdtAmount: 4998, fxRate: quoteRate,
  vndAmount: vndForUsdt(4998, quoteRate), status: "awaiting_payment", createdAt: now, expireAt: now + 30 * 60_000,
  paymentMode: "hosted", providerStatus: "rejected" };
const oldExpired: DepositIntent = { ...oldAttempt, status: "expired", expireAt: now - 1 };
const existing20: DepositIntent = { intentId: "VQR-existing-20", usdtAmount: 20, fxRate: quoteRate,
  vndAmount: vndForUsdt(20, quoteRate), status: "awaiting_payment", createdAt: now, expireAt: now + 30 * 60_000,
  paymentMode: "hosted", providerStatus: "created", paymentUrl: "https://api.hdpayadmin.com/pay?id=existing20" };
async function expiredView(translations: typeof zh = zh) {
  const h = harness({ warm: true, initialIntents: [oldAttempt], translations });
  await vi.waitFor(() => expect(h.fx.configReady && h.dep.serverStatus === "ready").toBe(true)); await Vue.nextTick();
  expect((h.state().viewIntentId as Vue.Ref<string>).value).toBe(oldAttempt.intentId);
  h.setCanonicalIntents([existing20, oldExpired]); await h.dep.refreshRemoteVietQrDeposits(); await Vue.nextTick();
  expect((h.state().viewIntentId as Vue.Ref<string>).value).toBe(oldAttempt.intentId);
  return h;
}
const existingControl = (h: ReturnType<typeof harness>) => control(h.root, "nx-bank-existing-order-cta");

test.each([zh, en, vietnamese])("a fresh canonical list offers an explicit existing order choice in the actual locale (%#), without replacing or creating an order", async messages => {
  const h = await expiredView(messages), choice = existingControl(h)!;
  expect(h.text()).toContain(messages.bankPane.expiredTitle); expect(choice.props["aria-disabled"]).toBe(false);
  expect(textOf(choice)).toBe(`${messages.store.viewDetails} · ${messages.store.pendingBarLabel} · 20.00 USDT`);
  expect(h.text()).toContain(messages.topupChrome.depositNotArrived);
  const before = h.dep.intents.map(item => ({ ...item })), readCount = h.transport.mock.calls.length;
  const saveSession = vi.spyOn(h.vault, "save"), clearSession = vi.spyOn(h.vault, "clear");
  (h.state().createError as Vue.Ref<string>).value = messages.bankPane.hostedRejectedNote;
  (choice.props.onClick as () => void)(); await Vue.nextTick();
  expect((h.state().viewIntentId as Vue.Ref<string>).value).toBe(existing20.intentId);
  expect(h.text()).toContain(fmtVnd(existing20.vndAmount)); expect(h.text()).toContain(messages.bankPane.hostedContinueCta);
  expect(h.text()).not.toContain(messages.bankPane.expiredTitle); expect(existingControl(h)).toBeUndefined();
  expect((h.state().createError as Vue.Ref<string>).value).toBe(""); expect(h.dep.intents).toEqual(before);
  expect(h.dep.records).toEqual([]); expect(h.dep.remoteReceipts).toEqual([]);
  expect(h.transport).toHaveBeenCalledTimes(readCount); expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  expect(h.open).not.toHaveBeenCalled(); expect(h.transport.mock.calls.every(([request]) => request.method === "GET")).toBe(true);
  expect(saveSession).not.toHaveBeenCalled(); expect(clearSession).not.toHaveBeenCalled();
});

test("cached orders and a pending first canonical read cannot offer an existing-order choice", async () => {
  const h = harness({ warm: true, cachedIntents: [oldAttempt, existing20],
    initialIntents: [existing20, oldExpired], deferFirstIntentRead: true });
  await Vue.nextTick(); h.dep.intents[0] = oldExpired; await Vue.nextTick();
  expect(h.dep.serverStatus).toBe("loading"); expect(h.text()).toContain(zh.bankPane.expiredTitle);
  expect(existingControl(h)).toBeUndefined(); expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  h.releaseFirstIntentRead(); await vi.waitFor(() => expect(h.dep.serverStatus).toBe("ready")); await Vue.nextTick();
  expect(existingControl(h)?.props["aria-disabled"]).toBe(false); expect(h.open).not.toHaveBeenCalled();
});

test("an in-flight early return cannot promote cached ready orders into a fresh canonical choice", async () => {
  const h = harness({ warm: true, cachedIntents: [oldAttempt, existing20], initialIntents: [existing20, oldExpired] });
  h.dep.refreshRemoteVietQrDeposits.mockImplementationOnce(async () => {});
  await Vue.nextTick(); h.dep.intents[0] = oldExpired; await Vue.nextTick();
  expect(h.dep.serverStatus).toBe("ready"); expect(existingControl(h)).toBeUndefined();
  await h.dep.refreshRemoteVietQrDeposits(); await Vue.nextTick();
  expect(existingControl(h)?.props["aria-disabled"]).toBe(false);
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});

test("a receipt-only loading/ready transition cannot reauthorize the existing choice without a new intent list", async () => {
  const h = await expiredView(), choice = existingControl(h)!;
  h.dep.serverStatus = "loading"; await Vue.nextTick();
  h.dep.serverStatus = "ready"; await Vue.nextTick();
  expect(existingControl(h)).toBe(choice); expect(choice.props["aria-disabled"]).toBe(true);
  (choice.props.onClick as () => void)();
  expect((h.state().viewIntentId as Vue.Ref<string>).value).toBe(oldAttempt.intentId);
  await h.dep.refreshRemoteVietQrDeposits(); await Vue.nextTick();
  expect(existingControl(h)?.props["aria-disabled"]).toBe(false);
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});

test.each(["CREATE", "CANCEL", "GET_CONFLICT"] as const)("receipt-only ready cannot authorize a choice after a concurrent %s readback replaces intents", async command => {
  const h = await expiredView(), choice = existingControl(h)!;
  const unrelated: DepositIntent = { ...oldAttempt, intentId: "VQR-other-command", usdtAmount: 25,
    vndAmount: vndForUsdt(25, quoteRate), paymentMode: "manual", providerStatus: undefined };
  if (command !== "CREATE") h.dep.intents.push(unrelated);
  h.dep.remoteReceiptMoreStatus = "loading"; h.dep.serverStatus = "loading"; await Vue.nextTick();
  expect(h.dep.remoteReceiptInitialStatus).toBe("ready"); expect(choice.props["aria-disabled"]).toBe(true);
  const before = h.dep.intents;
  // Apply the actual Store's command boundary semantics, without duplicating the pane's decision logic.
  h.dep.intents = command === "CREATE" ? [{ ...unrelated, paymentMode: "hosted", providerStatus: "created",
    paymentUrl: "https://api.hdpayadmin.com/pay?id=other" }, ...h.dep.intents]
    : h.dep.intents.map(item => item.intentId === unrelated.intentId
      ? { ...item, status: command === "CANCEL" ? "cancelled" as const : "credited" as const } : item);
  expect(h.dep.intents).not.toBe(before);
  h.dep.remoteReceiptMoreStatus = "ready"; h.dep.serverStatus = "ready"; await Vue.nextTick();
  const currentChoice = existingControl(h)!;
  expect(currentChoice).toBe(choice); expect(currentChoice.props["aria-disabled"]).toBe(true);
  const readCount = h.transport.mock.calls.length;
  (currentChoice.props.onClick as () => void)();
  expect((h.state().viewIntentId as Vue.Ref<string>).value).toBe(oldAttempt.intentId);
  expect(h.transport).toHaveBeenCalledTimes(readCount);
  h.setCanonicalIntents([existing20, ...h.dep.intents.filter(item => item.intentId !== existing20.intentId)]);
  await h.dep.refreshRemoteVietQrDeposits(); await Vue.nextTick();
  const freshChoice = existingControl(h)!;
  expect(freshChoice.props["aria-disabled"]).toBe(false);
  (freshChoice.props.onClick as () => void)(); await Vue.nextTick();
  expect((h.state().viewIntentId as Vue.Ref<string>).value).toBe(existing20.intentId);
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});

test.each(["loading", "error", "creating", "opening"] as const)("the existing choice remains in place but refuses a click while %s", async state => {
  const h = await expiredView(), choice = existingControl(h)!, click = choice.props.onClick as () => void;
  const support = control(h.root, "nx-bank-support-link")!, supportIndex = support.parent!.children.indexOf(support);
  const readCount = h.transport.mock.calls.length;
  if (state === "loading" || state === "error") h.dep.serverStatus = state;
  if (state === "creating") (h.state().creating as Vue.Ref<boolean>).value = true;
  if (state === "opening") (h.state().openingHosted as Vue.Ref<boolean>).value = true;
  await Vue.nextTick(); expect(existingControl(h)).toBe(choice); expect(choice.props["aria-disabled"]).toBe(true);
  expect(support.parent!.children.indexOf(support)).toBe(supportIndex);
  click(); await Vue.nextTick(); expect((h.state().viewIntentId as Vue.Ref<string>).value).toBe(oldAttempt.intentId);
  expect(h.transport).toHaveBeenCalledTimes(readCount); expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});

test.each(["expired", "credited", "mismatch", "unknown", "pending", "missing", "url", "url-change", "amount", "deadline", "received", "matched", "record", "receipt"] as const)(
  "a captured existing-order click rechecks the current canonical %s fact", async change => {
    const h = await expiredView(), click = existingControl(h)!.props.onClick as () => void;
    const readCount = h.transport.mock.calls.length;
    if (change === "missing") h.dep.intents = [oldExpired];
    else if (change === "record") h.dep.records = [{ depositId: existing20.intentId, channel: "bank-vietqr", grossAmountUsdt: 20,
      feeUsdt: 0, creditedUsdt: 20, status: "credited", createdAt: now }];
    else if (change === "receipt") h.dep.remoteReceipts = [{ intentNo: existing20.intentId }];
    else h.dep.intents[0] = { ...existing20, ...(change === "expired" ? { status: "expired" as const }
      : change === "credited" ? { status: "credited" as const }
      : change === "mismatch" ? { status: "mismatch_review" as const }
      : change === "unknown" ? { providerStatus: "submit_unknown" as const }
      : change === "pending" ? { providerStatus: "pending" as const }
      : change === "url" ? { paymentUrl: "https://untrusted.example/pay" }
      : change === "url-change" ? { paymentUrl: "https://api.hdpayadmin.com/pay?id=replaced" }
      : change === "amount" ? { usdtAmount: 21 }
      : change === "deadline" ? { expireAt: now }
      : change === "received" ? { receivedVnd: existing20.vndAmount }
      : { matchedAt: now }) };
    click(); await Vue.nextTick(); expect((h.state().viewIntentId as Vue.Ref<string>).value).toBe(oldAttempt.intentId);
    expect(h.transport).toHaveBeenCalledTimes(readCount); expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
  });

test.each(["awaiting", "unknown", "credited", "mismatch", "refund", "cancelled", "paid", "received", "matched", "record", "receipt", "form"] as const)(
  "a successful list never overwrites the current %s view or its receipt state", async state => {
    const h = await expiredView();
    let old = { ...oldExpired };
    if (state === "awaiting") old = { ...oldAttempt, providerStatus: "created", paymentUrl: existing20.paymentUrl };
    if (state === "unknown") old = { ...oldExpired, providerStatus: "submit_unknown" };
    if (state === "credited") old.status = "credited";
    if (state === "mismatch") old.status = "mismatch_review";
    if (state === "refund") old.status = "return_pending";
    if (state === "cancelled") old.status = "cancelled";
    if (state === "received") old.receivedVnd = old.vndAmount;
    if (state === "matched") old.matchedAt = now;
    if (state === "record") h.dep.records = [{ depositId: old.intentId, channel: "bank-vietqr", grossAmountUsdt: old.usdtAmount,
      feeUsdt: 0, creditedUsdt: old.usdtAmount, status: "credited", createdAt: now }];
    if (state === "paid") (h.state().paidPressed as Vue.Ref<boolean>).value = true;
    if (state === "receipt") h.dep.remoteReceipts = [{ intentNo: old.intentId }];
    if (state === "form") (h.state().startNewTopup as () => void)();
    h.setCanonicalIntents([existing20, old]); await h.dep.refreshRemoteVietQrDeposits(); await Vue.nextTick();
    expect(existingControl(h)).toBeUndefined();
    expect((h.state().viewIntentId as Vue.Ref<string | null>).value).toBe(state === "form" ? null : old.intentId);
    if (state === "received") { expect(h.text()).toContain(zh.bankPane.lateNote); expect(h.text()).toContain(zh.topupChrome.depositNotArrived); }
    expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
  });

test.each(["epoch", "account-return", "session", "unmount"] as const)("a previously rendered choice cannot be applied after %s", async change => {
  const h = await expiredView(), click = existingControl(h)!.props.onClick as () => void;
  if (change === "epoch") h.app.accountBindingEpoch++;
  if (change === "account-return") { h.restore(8, 8); h.restore(7, 7); }
  if (change === "session") h.auth.isAuthenticated = false;
  if (change === "unmount") h.unmount();
  click(); expect((h.state().viewIntentId as Vue.Ref<string>).value).toBe(oldAttempt.intentId);
  await Vue.nextTick();
  if (change === "epoch" || change === "account-return") {
    await vi.waitFor(() => expect(h.dep.serverStatus).toBe("ready")); await Vue.nextTick();
    const readCount = h.transport.mock.calls.length;
    click(); expect((h.state().viewIntentId as Vue.Ref<string>).value).toBe(oldAttempt.intentId);
    expect(h.transport).toHaveBeenCalledTimes(readCount);
  }
  expect(h.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});
