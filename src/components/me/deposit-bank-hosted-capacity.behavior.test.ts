import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import ts from "typescript";
import source from "./deposit-bank-pane.vue?raw";
import { createPaymentApi } from "@/api/payment-api";
import { ApiError } from "@/api/errors";
import { useFx } from "@/store/fx";
import { computeQuoteRate, fmtVnd, vndForUsdt } from "@/store/fx-core";
import { en } from "@/i18n/messages/en";
import { fmt } from "@/i18n/format";
import { runRecoverableFundsOperation } from "@/lib/recoverable-funds-operation";
import { createSessionVault } from "@/api/session-vault";
import { remoteAccountScope } from "@/lib/remote-account-epoch";

const runtime = vi.hoisted(() => ({ config: vi.fn(), fxQuote: vi.fn() }));
const sessionVault = createSessionVault();
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, paymentApi: runtime,
  sessionVault: { read: () => sessionVault.read() } }));
const quoteRate = computeQuoteRate(26000, 1.5);

function config(known: boolean | undefined = false, remaining = 0) {
  return { serverCanonical: true, source: "nx_vietqr_config", sourceEnvironment: "PRODUCTION", runId: "",
    vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
      todayRemainingDepositUsdt: remaining, todayRemainingVnd: remaining * quoteRate,
      toleranceVnd: 1000, graceMinutes: 10, version: 4, feeVnd: 0, feeUsdt: 0,
      ...(known === undefined ? {} : { dailyCapacityKnown: known }) } };
}

function install(response = config()) {
  const api = createPaymentApi({ request: async (request: { path: string }) => request.path.includes("fx-quote")
    ? { serverCanonical: true, source: "nx_finance_fx_quote_config", sourceEnvironment: "PRODUCTION", runId: "",
      baseRateVndPerUsdt: 26000, buySpreadPct: 1.5, quoteRateVndPerUsdt: quoteRate,
      lockWindowMinutes: 30, version: 7, asOf: "2026-09-11T00:00:00Z" }
    : response } as never, "dev");
  runtime.config.mockImplementation(() => api.config());
  runtime.fxQuote.mockImplementation(() => api.fxQuote());
  return response;
}

function pane(fx: ReturnType<typeof useFx>) {
  const start = source.indexOf('const amount = ref("25")');
  const end = source.indexOf('function regen()', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const code = ts.transpileModule(source.slice(start, end) + `
    return { amount, minLabel, maxLabel, limitLine, dailyCapacityKnown, todayRemainingLabel, todayRemainingLine, feeNote, amountError,
      vndPreview, dailyCapacityExhausted, bankRailAvailable, fxUsable, inRange, ctaEnabled,
      creating, createError, createRecovery, goCreateRecovery, createOrder, completeCreateOrder, onAmount };
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const dep = { currentAccountKey: () => "user:7", createRemoteBankIntent: vi.fn(async () => ({ intentId: "owned-intent" })) };
  const toast = { error: vi.fn() };
  const args = { ref: Vue.ref, computed: Vue.computed, watch: Vue.watch, fx, paymentSessionReady: Vue.ref(true), remoteApiEnabled: true, MIN_DEPOSIT_USDT: 10,
    BANK_MAX_DEPOSIT_USDT: 5000, dep, toast, t: Vue.ref(en), fmt, fmtVnd, vndForUsdt,
    runRecoverableFundsOperation, ApiError, autoResumePending: Vue.ref(false), viewIntentId: Vue.ref(null),
    paidPressed: Vue.ref(false), pageActive: Vue.ref(true), openHostedOrder: vi.fn(),
    app: Vue.reactive({ accountKey: "user:7", accountBindingEpoch: 1 }) };
  const bindings = new Function(...Object.keys(args), code)(...Object.values(args));
  return { bindings, dep, toast };
}

const template = parse(source).descriptor.template!.content;
const render = new Function("Vue", compile(template, { mode: "function", prefixIdentifiers: true,
  isCustomElement: (tag) => tag === "view" || tag === "text" }).code)(Vue);
async function show(view: ReturnType<typeof pane>, fx: ReturnType<typeof useFx>) {
  const styles = Object.fromEntries([...source.matchAll(/\b(?:const|function)\s+(\w+Style)\b/g)].map((match) => [match[1], {}]));
  const app = Vue.createSSRApp({ render, setup: () => ({ ...styles, ...view.bindings, fx,
    paneView: "form", intent: null, readError: "", paymentSessionReady: true, app: { accountBindingEpoch: 1 }, t: en, fmt }) });
  app.component("FxRateLine", { render: () => Vue.h("aside") });
  return renderToString(app);
}

beforeEach(() => {
  setActivePinia(createPinia()); vi.useFakeTimers();
  runtime.config.mockReset(); runtime.fxQuote.mockReset();
  sessionVault.save({ accessToken: "test-access", refreshToken: "test-refresh", tokenType: "Bearer",
    user: { userId: 7, countryCode: "+86", phone: "13800000007", nickname: "Test", onboardingComplete: true } });
  remoteAccountScope.bind("user:7");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test("unknown capacity survives real API and FX store, renders no fake limit, and passes both create gates", async () => {
  install(); const fx = useFx(); await fx.load(); const view = pane(fx);
  expect(fx).toMatchObject({ configReady: true, dailyCapacityKnown: false, todayRemainingDepositUsdt: 0 });
  expect(view.bindings.ctaEnabled.value).toBe(true);
  const html = await show(view, fx);
  expect(html).toContain(fmt(en.bankPane.limitNote, { min: "$10", max: "$5,000" }));
  expect(html).not.toContain(fmt(en.bankPane.todayRemainingNote, { remaining: "$0" }));
  expect(html).not.toContain(en.bankPane.dailyCapacityExhaustedTitle.replaceAll("'", "&#39;"));
  expect(html).not.toMatch(/Infinity|∞/);
  view.bindings.createOrder(); await vi.advanceTimersByTimeAsync(600);
  expect(runtime.config).toHaveBeenCalledTimes(2);
  expect(view.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(25, "user:7");
  expect(view.bindings.creating.value).toBe(false);
});

test("a form retry still clears its previous CREATE error immediately and settles with its entered amount", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  install(); const fx = useFx(); await fx.load(); const view = pane(fx);
  view.dep.createRemoteBankIntent.mockRejectedValueOnce(new ApiError({ kind: "http", status: 422, message: "HDPAY_ORDER_CREATE_REJECTED" }));
  view.bindings.createOrder();
  await vi.advanceTimersByTimeAsync(600);
  expect(view.bindings.createError.value).toBe(en.bankPane.hostedRejectedNote);
  expect(view.bindings.creating.value).toBe(false);
  view.bindings.createOrder();
  expect(view.bindings.createError.value).toBe("");
  expect(view.bindings.creating.value).toBe(true);
  expect(await show(view, fx)).not.toContain(en.bankPane.hostedRejectedNote);
  await vi.advanceTimersByTimeAsync(600);
  expect(view.dep.createRemoteBankIntent).toHaveBeenCalledTimes(2);
  expect(view.dep.createRemoteBankIntent).toHaveBeenLastCalledWith(25, "user:7");
  expect(view.bindings.createError.value).toBe("");
  expect(view.bindings.creating.value).toBe(false);
});

test.each([true, undefined])("known or legacy zero capacity remains exhausted: %s", async (known) => {
  const response = config(true); if (known === undefined) delete (response.vietQr as { dailyCapacityKnown?: boolean }).dailyCapacityKnown;
  install(response); const fx = useFx(); await fx.load(); const view = pane(fx);
  expect(view.bindings.ctaEnabled.value).toBe(false);
  const html = await show(view, fx);
  expect(html).toContain(en.bankPane.dailyCapacityExhaustedTitle.replaceAll("'", "&#39;"));
  expect(html).toContain(fmt(en.bankPane.todayRemainingNote, { remaining: "$0" }));
  view.bindings.createOrder(); await vi.advanceTimersByTimeAsync(600);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
});

test("a refreshed known zero limit blocks an order admitted by the earlier unknown snapshot", async () => {
  install(); const fx = useFx(); await fx.load(); const view = pane(fx);
  view.bindings.createOrder(); install(config(true)); await vi.advanceTimersByTimeAsync(600);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  expect(view.bindings.createError.value).toBe(fmt(en.bankPane.dailyCapacityExceeded, { max: "$0" }));
  expect(view.bindings.creating.value).toBe(false);
});

test.each([9, 5001])("unknown capacity does not bypass per-transaction bounds: %s", async (amount) => {
  install(); const fx = useFx(); await fx.load(); const view = pane(fx);
  view.bindings.amount.value = String(amount); expect(view.bindings.ctaEnabled.value).toBe(false);
  view.bindings.createOrder(); await vi.advanceTimersByTimeAsync(600);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  await view.bindings.completeCreateOrder(amount, "user:7");
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
});

test.each([false, true])("final capacity error uses daily copy only for a known snapshot: %s", async (known) => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  install(config(known, known ? 50 : 0)); const fx = useFx(); await fx.load(); const view = pane(fx);
  view.dep.createRemoteBankIntent.mockRejectedValue(new ApiError({ kind: "business", message: "VIETQR_DAILY_CAPACITY_EXCEEDED" }));
  view.bindings.createOrder(); await vi.advanceTimersByTimeAsync(600);
  expect(view.dep.createRemoteBankIntent).toHaveBeenCalledOnce();
  expect(view.bindings.createError.value).toBe(known
    ? fmt(en.bankPane.dailyCapacityExceeded, { max: "$50" }) : en.topupChrome.depositOpFailedNote);
  expect(view.bindings.createError.value).not.toMatch(/Infinity|∞/);
});

test("a network failure clears capacity knowledge and a successful retry restores the server snapshot", async () => {
  install(); const fx = useFx(); await fx.load();
  runtime.config.mockRejectedValueOnce(new Error("temporary")); await fx.load();
  expect(fx).toMatchObject({ configReady: false, fxAvailable: false, dailyCapacityKnown: true });
  await fx.load();
  expect(fx).toMatchObject({ configReady: true, fxAvailable: true, syncFailed: false, dailyCapacityKnown: false });
});

test("explicit developer failure remains until cleared and does not corrupt later recovery", async () => {
  install(); const fx = useFx(); fx._devSetFxFailure(true); await fx.load();
  expect(fx.fxAvailable).toBe(false);
  fx._devSetFxFailure(false); await fx.load(); expect(fx.fxAvailable).toBe(true);
});

test.each(["paused", "unavailable"])("refresh rejects a %s rail before create", async (state) => {
  install(); const fx = useFx(); await fx.load(); const view = pane(fx);
  view.bindings.createOrder();
  if (state === "paused") { const response = config(); response.vietQr.enabled = false; install(response); }
  else runtime.config.mockRejectedValueOnce(new Error("temporary"));
  await vi.advanceTimersByTimeAsync(600);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  expect(view.bindings.creating.value).toBe(false);
});
