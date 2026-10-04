import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import ts from "typescript";
import source from "./deposit-bank-pane.vue?raw";
import depositsSource from "@/store/deposits.ts?raw";
import type { DepositIntent } from "@/store/types";
import { ApiError, isAmbiguousOutcome } from "@/api/errors";
import { createApiClient, type HttpRequest } from "@/api/api-client";
import { createPaymentApi } from "@/api/payment-api";
import { createSessionVault } from "@/api/session-vault";
import { normalizeAccountKey } from "@/store/account-cloud";
import { VietQrCommandKeyRegistry, type VietQrCommandStorage } from "@/lib/vietqr-command-key";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { computeQuoteRate, fmtVnd, vndForUsdt } from "@/store/fx-core";
import { findResumablePaymentIntent } from "@/lib/hosted-payment";
import { runRecoverableFundsOperation } from "@/lib/recoverable-funds-operation";
import { buildVietQrTransferSteps, isPayableVietQrCreateStatus, remoteGenerationMatches } from "@/lib/vietqr-remote-safety";
import { binarySessionReady as accountSessionReady } from "@/lib/binary-session-ready";

const descriptor = parse(source).descriptor;
const setupSource = descriptor.scriptSetup!.content;
const ast = ts.createSourceFile("deposit-bank-pane.ts", setupSource, ts.ScriptTarget.ES2022, true);
const exposed = ast.statements.flatMap((statement) => {
  if (ts.isFunctionDeclaration(statement)) return statement.name ? [statement.name.text] : [];
  if (!ts.isVariableStatement(statement)) return [];
  return statement.declarationList.declarations.flatMap((declaration) =>
    ts.isIdentifier(declaration.name) ? [declaration.name.text] : []);
});
const script = ts.transpileModule(setupSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText + `;return { ${exposed.join(", ")} };`;
const render = new Function("Vue", compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
}).code)(Vue) as Vue.RenderFunction;
const cleanups: Array<() => void> = [];
const now = Date.parse("2026-10-04T00:39:20Z");
const quoteRate = computeQuoteRate(26000, 1.5);
type Messages = typeof zh | typeof en | typeof vietnamese;

// The real Vue renderer supplies template handlers and updates disabled/loading
// props. This host replaces DOM I/O only; it does not mirror component logic.
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
function action(target: HostNode, name: string): HostNode | undefined {
  return String(target.props.class ?? "").split(/\s+/).includes(name)
    ? target : target.children.map(child => action(child, name)).find(Boolean);
}
function errorBanner(target: HostNode): HostNode | undefined {
  return (target.props.style as { background?: unknown } | undefined)?.background === "var(--v5-danger-soft)"
    ? target : target.children.map(errorBanner).find(Boolean);
}
const click = (target: HostNode) => (target.props.onClick as () => void)();

// Execute the unchanged production store methods with its real request/parser,
// error classifier and persisted registry. No retry or key algorithm is copied.
const storeAst = ts.createSourceFile("deposits.ts", depositsSource, ts.ScriptTarget.ES2022, true);
const storeMethods = new Map<string, string>();
function collectStoreMethods(entry: ts.Node) {
  if (ts.isFunctionDeclaration(entry) && entry.name) storeMethods.set(entry.name.text, entry.getText(storeAst));
  ts.forEachChild(entry, collectStoreMethods);
}
collectStoreMethods(storeAst);
const storeScript = ts.transpileModule(
  ["remoteIntentStatus", "remoteVietQrIntent", "createRemoteBankIntent"].map(name => {
    const method = storeMethods.get(name);
    if (!method) throw new Error(`Missing production deposit method: ${name}`);
    return method;
  }).join("\n"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
function memoryStorage(): VietQrCommandStorage {
  let value: unknown;
  return { read: () => value, write: next => { value = structuredClone(next); } };
}
function creationFlow(dep: { intents: DepositIntent[] }, responses: number[], storage = memoryStorage(), accountKey = "user:7", responseGate?: Promise<void>) {
  const registry = new VietQrCommandKeyRegistry(storage, () => "unit-install-0001");
  const vault = createSessionVault();
  vault.save({ accessToken: "unit-access", refreshToken: "unit-refresh", tokenType: "Bearer",
    user: { userId: Number(accountKey.slice(5)), countryCode: "+86", phone: "13800000007", nickname: "Test", onboardingComplete: true } });
  const requests = vi.fn(async (request: HttpRequest) => {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/api/app/deposits/vietqr/intents") {
      throw new Error(`Unexpected deposit request: ${request.method} ${request.url}`);
    }
    if (responseGate) await responseGate;
    const status = responses.shift() ?? 503;
    return { status, headers: {}, data: { code: status === 200 ? 0 : status,
      message: status === 200 ? "OK" : status === 503 ? "HDPAY_ORDER_SUBMIT_UNKNOWN" : "HDPAY_ORDER_CREATE_REJECTED",
      data: status === 200 ? { intentNo: "VQR-new", usdtAmount: 5000, fxRate: quoteRate,
        vndAmount: vndForUsdt(5000, quoteRate), status: "awaiting_payment",
        createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 60_000).toISOString(),
        creditedUsdt: 0, feeVnd: 0, feeUsdt: 0, version: 1, paymentMode: "hosted",
        providerStatus: "created", paymentUrl: "https://api.hdpayadmin.com/pay?id=new" } : null } };
  });
  const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: requests } });
  const context = { remoteApiEnabled: true, serverAccountKey: accountKey, remoteGeneration: 1,
    normalizeAccountKey, remoteGenerationMatches, isAmbiguousOutcome, isPayableVietQrCreateStatus,
    paymentApi: createPaymentApi(client), intents: Vue.toRef(dep, "intents"),
    vietQrCommandKey: registry.getOrCreate.bind(registry), finishVietQrCommand: registry.finish.bind(registry),
    bindVietQrIntent: registry.bindIntent.bind(registry) };
  const create = new Function("context", `const { ${Object.keys(context).join(", ")} } = context;\n${storeScript}\nreturn createRemoteBankIntent;`)(context) as
    (amount: number, account: string) => Promise<DepositIntent>;
  return { create, requests, registry, storage };
}

interface PaneState extends Record<string, unknown> {
  intent: Vue.ComputedRef<DepositIntent | null>;
  paneView: Vue.ComputedRef<string>;
  hostedRejected: Vue.ComputedRef<boolean>;
  hostedCanOpen: Vue.ComputedRef<boolean>;
  createError: Vue.Ref<string>;
  creating: Vue.Ref<boolean>;
  pageActive: Vue.Ref<boolean>;
  completeCreateOrder: (amount: number, account: string) => Promise<void>;
  openHostedOrder: (intent: DepositIntent) => void;
  goSupport: () => void;
  regen: () => void;
}

function pane(providerStatus: DepositIntent["providerStatus"] = "rejected", translations: Messages = zh) {
  const original: DepositIntent = {
    intentId: "VQR-existing", usdtAmount: 5000, fxRate: quoteRate, vndAmount: vndForUsdt(5000, quoteRate),
    status: "awaiting_payment", createdAt: now, expireAt: now + 6 * 60_000,
    paymentMode: "hosted", providerStatus,
    ...(providerStatus === "created" ? { paymentUrl: "https://api.hdpayadmin.com/pay?id=existing" } : {}),
  };
  const dep = Vue.reactive({
    intents: [original], records: [], serverStatus: "ready", serverError: "",
    currentAccountKey: () => "user:7", createRemoteBankIntent: vi.fn(async (_amount: number, _account: string): Promise<DepositIntent> => original),
    refreshRemoteVietQrDeposits: vi.fn(async () => {}),
    startRemoteVietQrPolling: vi.fn(), stopRemoteVietQrPolling: vi.fn(),
  });
  const fx = Vue.reactive({ fxAvailable: true, configReady: true, vietQrEnabled: true, dailyCapacityKnown: false,
    minDepositUsdt: 10, maxDepositUsdt: 5000, todayRemainingDepositUsdt: 0,
    quoteRate, feeUsdt: 0, feeVnd: 0, lockWindowMin: 30, load: vi.fn(async () => {}) });
  const app = Vue.reactive({ accountKey: "user:7", accountBindingEpoch: 1 });
  const navTo = vi.fn(), open = vi.fn(() => true), toast = { error: vi.fn(), success: vi.fn(), warn: vi.fn() };
  const mounted: Array<() => void> = [], unmounted: Array<() => void> = [];
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onMounted: (callback: () => void) => mounted.push(callback),
      onUnmounted: (callback: () => void) => unmounted.push(callback) },
    "@/components/me/fx-rate-line.vue": {}, "@/i18n/use-t": { useT: () => Vue.ref(translations) },
    "@/i18n/format": { fmt }, "@/lib/route": { navTo, navBack: vi.fn() },
    "@/store/ui": { toast, confirm: vi.fn() }, "@/store/deposits": { useDeposits: () => dep },
    "@/store/fx": { useFx: () => fx },
    "@/store/app": { useApp: () => app },
    "@/store/auth": { useAuth: () => ({ isAuthenticated: true, accountId: "user:7" }) },
    "@/lib/binary-session-ready": { binarySessionReady: accountSessionReady },
    "@/store/fx-core": { fmtVnd, vndForUsdt }, "@/store/server-time": { mockServerNow: () => now },
    "@/store/deposits-core": { BANK_MAX_DEPOSIT_USDT: 5000, MIN_DEPOSIT_USDT: 10 },
    "@/api/runtime": { remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: 7 } }) } },
    "@/api/errors": { ApiError },
    "@/lib/recoverable-funds-operation": { runRecoverableFundsOperation },
    "@/lib/vietqr-remote-safety": { buildVietQrTransferSteps },
    "@/lib/hosted-payment": { findResumablePaymentIntent, openHostedPaymentPage: open },
  };
  const scope = Vue.effectScope();
  const state = scope.run(() => new Function("require", "exports", script)(
    (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected bank pane dependency: ${name}`);
      return modules[name];
    }, {},
  )) as PaneState;
  mounted.forEach(callback => callback());
  cleanups.push(() => { unmounted.forEach(callback => callback()); scope.stop(); });
  const definition = () => ({
    components: { FxRateLine: { render: () => null } }, setup: () => ({ ...state, fmt, fmtVnd }), render,
  });
  return { state, dep, fx, app, navTo, open, toast, html: () => renderToString(Vue.createSSRApp(definition())),
    mount: () => {
      const root = node("root"), app = renderer.createApp(definition());
      app.mount(root); cleanups.push(() => app.unmount());
      return { root, retry: () => action(root, "nx-bank-regen-cta") };
    } };
}

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.useRealTimers(); vi.restoreAllMocks(); });

test.each([zh, en, vietnamese])("a resumed rejected order offers explicit retry and support without automatic payment or POST", async (messages) => {
  const view = pane("rejected", messages);
  expect(view.state.intent.value?.intentId).toBe("VQR-existing");
  expect(view.state.paneView.value).toBe("order");
  expect(view.state.hostedRejected.value).toBe(true);
  const html = await view.html();
  expect(html).toContain(messages.bankPane.hostedRejectedNote);
  expect(messages.help.contactSupport).toBeTypeOf("string");
  expect(html).toContain(messages.help.contactSupport);
  expect(html).toContain(messages.bankPane.regenCta);
  expect(html).not.toContain(messages.bankPane.hostedPendingNote);
  expect(html).not.toContain(fmt(messages.bankPane.countdown, { time: "06:00" }));
  expect(html).toContain("nx-bank-regen-cta");
  expect(html).not.toMatch(/nx-bank-(?:create|hosted-continue|cancel)-cta/);
  view.state.goSupport();
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith("/pages/me/support-tickets?mode=create&cat=deposit");
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  expect(view.open).not.toHaveBeenCalled();
  expect(view.dep.intents[0]).toMatchObject({ intentId: "VQR-existing", status: "awaiting_payment", providerStatus: "rejected" });
});

test.each(["pending", "submit_unknown", "not_submitted"] as const)("%s continues to show the existing pending guidance", async (status) => {
  const view = pane(status), html = await view.html();
  expect(html).toContain(zh.bankPane.hostedPendingNote);
  expect(html).toContain(fmt(zh.bankPane.countdown, { time: "06:00" }));
  expect(html).not.toContain(zh.bankPane.hostedRejectedNote);
  expect(html).not.toContain("nx-bank-regen-cta");
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
});

test("the rejected-order template retries its original amount and blocks duplicate clicks until the result settles", async () => {
  const view = pane(), mounted = view.mount();
  let resolve!: (intent: DepositIntent) => void;
  const response = new Promise<DepositIntent>(done => { resolve = done; });
  view.dep.createRemoteBankIntent.mockImplementation(async () => {
    const created = await response;
    view.dep.intents = [created, ...view.dep.intents];
    return created;
  });
  expect(mounted.retry()?.props["aria-disabled"]).toBe(false);
  click(mounted.retry()!);
  click(mounted.retry()!);
  await Vue.nextTick();
  expect(mounted.retry()?.props["aria-disabled"]).toBe(true);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(600);
  expect(view.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(5000, "user:7");
  click(mounted.retry()!);
  await vi.advanceTimersByTimeAsync(1200);
  expect(view.dep.createRemoteBankIntent).toHaveBeenCalledOnce();
  expect(view.state.intent.value?.intentId).toBe("VQR-existing");
  expect(view.open).not.toHaveBeenCalled();
  resolve({ ...view.dep.intents[0], intentId: "VQR-new", providerStatus: "created",
    paymentUrl: "https://api.hdpayadmin.com/pay?id=new" });
  await vi.advanceTimersByTimeAsync(0);
  await Vue.nextTick();
  expect(view.state.creating.value).toBe(false);
  expect(view.state.intent.value?.intentId).toBe("VQR-new");
  expect(view.dep.intents.find(item => item.intentId === "VQR-existing")).toMatchObject({ providerStatus: "rejected", usdtAmount: 5000 });
  expect(view.open).toHaveBeenCalledExactlyOnceWith("https://api.hdpayadmin.com/pay?id=new");
});

test.each([zh, en, vietnamese])("a rejected CREATE banner and both CTAs stay in place throughout an explicit retry", async (messages) => {
  const view = pane("rejected", messages), mounted = view.mount(), storage = memoryStorage();
  const rejected = creationFlow(view.dep, [422], storage);
  view.dep.createRemoteBankIntent.mockImplementation(rejected.create);
  click(mounted.retry()!);
  await vi.advanceTimersByTimeAsync(600);
  await Vue.nextTick();
  expect(rejected.requests).toHaveBeenCalledOnce();
  expect(view.state.createError.value).toBe(messages.bankPane.hostedRejectedNote);
  const banner = errorBanner(mounted.root)!, retry = mounted.retry()!;
  const support = action(mounted.root, "nx-bank-support-link")!;
  expect(banner).toBeDefined();
  const anchors = [banner, retry, support].map(target => ({
    target, parent: target.parent, index: target.parent!.children.indexOf(target),
    style: { ...(target.props.style as Record<string, unknown>) },
  }));
  const expectStable = () => {
    expect(errorBanner(mounted.root)).toBe(banner);
    expect(mounted.retry()).toBe(retry);
    expect(action(mounted.root, "nx-bank-support-link")).toBe(support);
    for (const anchor of anchors) {
      expect(anchor.target.parent).toBe(anchor.parent);
      expect(anchor.parent!.children.indexOf(anchor.target)).toBe(anchor.index);
      expect(anchor.target.props.style).toEqual(anchor.style);
    }
    expect(view.state.createError.value).toBe(messages.bankPane.hostedRejectedNote);
    expect(retry.props["aria-disabled"]).toBe(true);
    expect(view.state.creating.value).toBe(true);
    expect(view.state.intent.value?.intentId).toBe("VQR-existing");
    expect(view.navTo).not.toHaveBeenCalled();
  };
  let resolve!: () => void;
  const response = new Promise<void>(done => { resolve = done; });
  const pending = creationFlow(view.dep, [200], storage, "user:7", response);
  view.dep.createRemoteBankIntent.mockImplementation(pending.create);
  click(retry);
  await Vue.nextTick();
  expectStable();
  click(mounted.retry()!);
  await vi.advanceTimersByTimeAsync(600);
  await Vue.nextTick();
  expectStable();
  expect(pending.requests).toHaveBeenCalledOnce();
  expect(pending.requests.mock.calls[0][0].body).toEqual({ usdtAmount: 5000 });
  click(mounted.retry()!);
  await vi.advanceTimersByTimeAsync(1200);
  await Vue.nextTick();
  expectStable();
  expect(pending.requests).toHaveBeenCalledOnce();
  resolve();
  await vi.advanceTimersByTimeAsync(0);
  await Vue.nextTick();
  expect(view.state.createError.value).toBe("");
  expect(errorBanner(mounted.root)).toBeUndefined();
  expect(view.state.creating.value).toBe(false);
  expect(view.state.intent.value?.intentId).toBe("VQR-new");
  expect(view.dep.intents.find(item => item.intentId === "VQR-existing")).toMatchObject({ usdtAmount: 5000, providerStatus: "rejected" });
  expect(view.open).toHaveBeenCalledExactlyOnceWith("https://api.hdpayadmin.com/pay?id=new");
  expect(view.navTo).not.toHaveBeenCalled();
});

test.each([422, 503])("a settled HTTP %s retry updates the retained banner with current human guidance", async (status) => {
  const view = pane(), mounted = view.mount();
  view.state.createError.value = zh.bankPane.hostedOpenFailed;
  await Vue.nextTick();
  const flow = creationFlow(view.dep, [status]);
  view.dep.createRemoteBankIntent.mockImplementation(flow.create);
  click(mounted.retry()!);
  expect(view.state.createError.value).toBe(zh.bankPane.hostedOpenFailed);
  await vi.advanceTimersByTimeAsync(600);
  await Vue.nextTick();
  const expected = status === 422 ? zh.bankPane.hostedRejectedNote : zh.topupChrome.depositOpFailedNote;
  expect(view.state.createError.value).toBe(expected);
  expect(errorBanner(mounted.root)).toBeDefined();
  expect(view.toast.error).toHaveBeenCalledExactlyOnceWith(expected);
  expect(view.state.creating.value).toBe(false);
  expect(mounted.retry()?.props["aria-disabled"]).toBe(false);
  expect(view.state.intent.value?.intentId).toBe("VQR-existing");
  expect(flow.requests).toHaveBeenCalledOnce();
  expect(view.open).not.toHaveBeenCalled();
  expect(view.navTo).not.toHaveBeenCalled();
});

test.each(["cancelled", "return_pending"] as const)("a real %s form submits without a preset and immediately clears its previous CREATE banner", async (status) => {
  const view = pane(), mounted = view.mount();
  const flow = creationFlow(view.dep, [422, 503]);
  view.dep.createRemoteBankIntent.mockImplementation(flow.create);
  click(mounted.retry()!);
  await vi.advanceTimersByTimeAsync(600);
  await Vue.nextTick();
  expect(view.state.createError.value).toBe(zh.bankPane.hostedRejectedNote);
  expect(flow.requests).toHaveBeenCalledOnce();
  expect(flow.requests.mock.calls[0][0].body).toEqual({ usdtAmount: 5000 });
  view.dep.intents[0].status = status;
  await Vue.nextTick();
  expect(view.state.intent.value).toMatchObject({ intentId: "VQR-existing", status });
  expect(view.state.paneView.value).toBe("form");
  expect(mounted.retry()).toBeUndefined();
  expect(errorBanner(mounted.root)).toBeDefined();
  const submit = action(mounted.root, "nx-bank-create-cta")!;
  expect(submit.props["aria-disabled"]).toBe(false);
  click(submit);
  expect(view.state.createError.value).toBe("");
  expect(view.state.creating.value).toBe(true);
  await Vue.nextTick();
  expect(errorBanner(mounted.root)).toBeUndefined();
  expect(submit.props["aria-disabled"]).toBe(true);
  click(submit);
  await vi.advanceTimersByTimeAsync(600);
  await Vue.nextTick();
  expect(flow.requests).toHaveBeenCalledTimes(2);
  expect(flow.requests.mock.calls[1][0].body).toEqual({ usdtAmount: 25 });
  expect(view.state.intent.value).toMatchObject({ intentId: "VQR-existing", status });
  expect(view.state.createError.value).toBe(zh.topupChrome.depositOpFailedNote);
  expect(view.state.creating.value).toBe(false);
  expect(view.open).not.toHaveBeenCalled();
  expect(view.navTo).not.toHaveBeenCalled();
});

test("an unavailable quote disables the rejected-order retry without a POST", async () => {
  const view = pane(), mounted = view.mount();
  view.fx.fxAvailable = false;
  await Vue.nextTick();
  expect(mounted.retry()?.props["aria-disabled"]).toBe(true);
  click(mounted.retry()!);
  await vi.advanceTimersByTimeAsync(1200);
  expect(view.state.creating.value).toBe(false);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  expect(view.state.intent.value?.intentId).toBe("VQR-existing");
});

const fxChanges = (["leave", "account", "epoch"] as const).flatMap(change =>
  [false, true].map(hasPreviousError => [change, hasPreviousError] as const));
test.each(fxChanges)("a retry awaiting FX stops silently after %s changes (previous error: %s)", async (change, hasPreviousError) => {
  const view = pane(), mounted = view.mount();
  const previousError = hasPreviousError ? zh.bankPane.hostedRejectedNote : "";
  view.state.createError.value = previousError;
  let resolve!: () => void;
  const quote = new Promise<void>(done => { resolve = done; });
  view.fx.load.mockImplementation(() => quote);
  click(mounted.retry()!);
  await vi.advanceTimersByTimeAsync(600);
  expect(view.fx.load).toHaveBeenCalledOnce();
  expect(view.state.creating.value).toBe(true);
  if (change === "leave") view.state.pageActive.value = false;
  if (change === "account") view.app.accountKey = "user:8";
  if (change === "epoch") view.app.accountBindingEpoch += 1;
  await Vue.nextTick();
  resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(view.state.creating.value).toBe(false);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  expect(view.state.createError.value).toBe(previousError);
  expect(view.toast.error).not.toHaveBeenCalled();
  expect(view.open).not.toHaveBeenCalled();
  expect(view.state.intent.value?.intentId).toBe("VQR-existing");
});

const lateOutcomes = (["leave", "account", "epoch"] as const).flatMap(change =>
  ([200, 422, 503] as const).flatMap(status =>
    [false, true].map(hasPreviousError => [change, status, hasPreviousError] as const)));
test.each(lateOutcomes)("a late POST result after %s stays silent for HTTP %s while the store settles its key (previous error: %s)", async (change, status, hasPreviousError) => {
  const view = pane(), mounted = view.mount(), storage = memoryStorage();
  const previousError = hasPreviousError ? zh.bankPane.hostedRejectedNote : "";
  view.state.createError.value = previousError;
  let resolve!: () => void;
  const response = new Promise<void>(done => { resolve = done; });
  const flow = creationFlow(view.dep, [status], storage, "user:7", response);
  view.dep.createRemoteBankIntent.mockImplementation(flow.create);
  click(mounted.retry()!);
  await vi.advanceTimersByTimeAsync(600);
  expect(flow.requests).toHaveBeenCalledOnce();
  expect(view.state.creating.value).toBe(true);
  const key = flow.requests.mock.calls[0][0].headers["Idempotency-Key"];
  if (change === "leave") view.state.pageActive.value = false;
  if (change === "account") view.app.accountKey = "user:8";
  if (change === "epoch") view.app.accountBindingEpoch += 1;
  await Vue.nextTick();
  resolve();
  await vi.advanceTimersByTimeAsync(0);
  await Vue.nextTick();
  expect(view.state.creating.value).toBe(false);
  expect(view.state.createError.value).toBe(previousError);
  expect(view.toast.error).not.toHaveBeenCalled();
  expect(view.open).not.toHaveBeenCalled();
  expect(view.navTo).not.toHaveBeenCalled();
  expect(view.state.intent.value?.intentId).toBe("VQR-existing");
  expect(flow.requests).toHaveBeenCalledOnce();
  const scope = JSON.stringify(["user:7", "CREATE", "5000.000000"]);
  const pending = (storage.read() as { pending: Record<string, { key: string; intentNo?: string }> }).pending[scope];
  if (status === 422) expect(pending).toBeUndefined();
  else {
    expect(pending.key).toBe(key);
    if (status === 200) expect(pending.intentNo).toBe("VQR-new");
  }
});

test("a persisted legacy 502 key retires on trusted 422 and only the next explicit retry creates a new intent", async () => {
  const storage = memoryStorage(), first = pane(), firstMount = first.mount();
  const legacy = creationFlow(first.dep, [502], storage);
  first.dep.createRemoteBankIntent.mockImplementation(legacy.create);
  click(firstMount.retry()!);
  await vi.advanceTimersByTimeAsync(600);
  const oldKey = legacy.requests.mock.calls[0][0].headers["Idempotency-Key"];
  expect(first.state.createError.value).toBe(zh.bankPane.hostedRejectedNote);
  expect(first.state.creating.value).toBe(false);
  const restored = pane(), restoredMount = restored.mount();
  const flow = creationFlow(restored.dep, [422, 200], storage);
  restored.dep.createRemoteBankIntent.mockImplementation(flow.create);
  click(restoredMount.retry()!);
  await vi.advanceTimersByTimeAsync(600);
  expect(flow.requests).toHaveBeenCalledOnce();
  expect(flow.requests.mock.calls[0][0].headers["Idempotency-Key"]).toBe(oldKey);
  expect(restored.state.createError.value).toBe(zh.bankPane.hostedRejectedNote);
  expect(restored.state.intent.value?.intentId).toBe("VQR-existing");
  expect(restoredMount.retry()?.props["aria-disabled"]).toBe(false);
  expect(restored.open).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(3000);
  expect(flow.requests).toHaveBeenCalledOnce();
  const scope = JSON.stringify(["user:7", "CREATE", "5000.000000"]);
  expect((storage.read() as { pending: Record<string, unknown> }).pending[scope]).toBeUndefined();
  click(restoredMount.retry()!);
  await vi.advanceTimersByTimeAsync(600);
  expect(flow.requests).toHaveBeenCalledTimes(2);
  const nextKey = flow.requests.mock.calls[1][0].headers["Idempotency-Key"];
  expect(nextKey).not.toBe(oldKey);
  const persisted = new VietQrCommandKeyRegistry(storage, () => "unused-install");
  expect(persisted.getOrCreate({ accountKey: "user:7", action: "CREATE", fingerprint: "5000.000000" })).toBe(nextKey);
  expect(flow.requests.mock.calls[1][0].body).toEqual({ usdtAmount: 5000 });
  expect(restored.state.intent.value?.intentId).toBe("VQR-new");
  expect(restored.state.createError.value).toBe("");
  expect(restored.dep.intents.find(item => item.intentId === "VQR-existing")).toMatchObject({ providerStatus: "rejected" });
  expect(restored.open).toHaveBeenCalledExactlyOnceWith("https://api.hdpayadmin.com/pay?id=new");
});

test("an unknown 503 outcome keeps the same persisted key on an explicit retry after restoring the component", async () => {
  const storage = memoryStorage(), first = pane(), firstMount = first.mount();
  const before = creationFlow(first.dep, [503], storage);
  first.dep.createRemoteBankIntent.mockImplementation(before.create);
  click(firstMount.retry()!);
  await vi.advanceTimersByTimeAsync(600);
  const originalKey = before.requests.mock.calls[0][0].headers["Idempotency-Key"];
  expect(first.state.createError.value).toBe(zh.topupChrome.depositOpFailedNote);
  expect(first.state.creating.value).toBe(false);
  const restored = pane(), restoredMount = restored.mount();
  const after = creationFlow(restored.dep, [503], storage);
  restored.dep.createRemoteBankIntent.mockImplementation(after.create);
  expect(after.requests).not.toHaveBeenCalled();
  click(restoredMount.retry()!);
  await vi.advanceTimersByTimeAsync(600);
  expect(after.requests).toHaveBeenCalledOnce();
  expect(after.requests.mock.calls[0][0].headers["Idempotency-Key"]).toBe(originalKey);
  await vi.advanceTimersByTimeAsync(3000);
  expect(after.requests).toHaveBeenCalledOnce();
  expect(restored.state.intent.value?.intentId).toBe("VQR-existing");
  expect(restored.open).not.toHaveBeenCalled();
});

test("trusted retirement remains isolated from another amount, account and CANCEL command", async () => {
  const storage = memoryStorage(), dep = Vue.reactive({ intents: [] as DepositIntent[] });
  const owner = creationFlow(dep, [503, 503, 422], storage);
  await expect(owner.create(5000, "user:7")).rejects.toMatchObject({ kind: "http", status: 503 });
  const oldKey = owner.requests.mock.calls[0][0].headers["Idempotency-Key"];
  await expect(owner.create(4999, "user:7")).rejects.toMatchObject({ kind: "http", status: 503 });
  const otherAmount = owner.requests.mock.calls[1][0].headers["Idempotency-Key"];
  const other = creationFlow(dep, [503], storage, "user:8");
  await expect(other.create(5000, "user:8")).rejects.toMatchObject({ kind: "http", status: 503 });
  const otherAccount = other.requests.mock.calls[0][0].headers["Idempotency-Key"];
  const cancel = { accountKey: "user:7", action: "CANCEL", fingerprint: "VQR-existing" } as const;
  const cancelKey = owner.registry.getOrCreate(cancel);
  await expect(owner.create(5000, "user:7")).rejects.toMatchObject({ kind: "http", status: 422 });
  expect(owner.requests.mock.calls[2][0].headers["Idempotency-Key"]).toBe(oldKey);
  const reloaded = new VietQrCommandKeyRegistry(storage, () => "unused-install");
  expect(reloaded.getOrCreate({ accountKey: "user:7", action: "CREATE", fingerprint: "5000.000000" })).not.toBe(oldKey);
  expect(reloaded.getOrCreate({ accountKey: "user:7", action: "CREATE", fingerprint: "4999.000000" })).toBe(otherAmount);
  expect(reloaded.getOrCreate({ accountKey: "user:8", action: "CREATE", fingerprint: "5000.000000" })).toBe(otherAccount);
  expect(reloaded.getOrCreate(cancel)).toBe(cancelKey);
  expect(new Set([oldKey, otherAmount, otherAccount, cancelKey]).size).toBe(4);
});

test("a refreshed created URL restores payment on the same order without creating another", async () => {
  const view = pane();
  view.dep.intents[0] = { ...view.dep.intents[0], providerStatus: "created", paymentUrl: "https://api.hdpayadmin.com/pay?id=existing" };
  await Vue.nextTick();
  const html = await view.html();
  expect(html).toContain("nx-bank-hosted-continue-cta");
  expect(html).toContain(zh.bankPane.hostedSecureNote);
  expect(html).not.toContain(zh.bankPane.hostedRejectedNote);
  view.state.openHostedOrder(view.state.intent.value!);
  expect(view.open).toHaveBeenCalledExactlyOnceWith("https://api.hdpayadmin.com/pay?id=existing");
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
});

test.each([zh, en, vietnamese])("the original CREATE rejection uses the same failure copy and never retries", async (messages) => {
  const view = pane("pending", messages);
  view.dep.createRemoteBankIntent.mockRejectedValue(new ApiError({ kind: "http", status: 502, code: 502, message: "HDPAY_ORDER_CREATE_REJECTED" }));
  await view.state.completeCreateOrder(25, "user:7");
  await vi.advanceTimersByTimeAsync(3000);
  expect(view.state.createError.value).toBe(messages.bankPane.hostedRejectedNote);
  expect(view.toast.error).toHaveBeenCalledExactlyOnceWith(messages.bankPane.hostedRejectedNote);
  expect(view.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(25, "user:7");
  expect(view.state.creating.value).toBe(false);
  expect(view.open).not.toHaveBeenCalled();
});

test.each(["credited", "expired"] as const)("canonical %s replaces rejection without an automatic CREATE", async (status) => {
  const view = pane();
  view.dep.intents[0].status = status;
  await Vue.nextTick();
  expect(view.state.paneView.value).toBe(status);
  const html = await view.html();
  expect(html).toContain(status === "credited" ? zh.bankPane.successTitle : "nx-bank-regen-cta");
  expect(html).not.toContain(zh.bankPane.hostedRejectedNote);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  if (status === "expired") {
    view.state.regen();
    await vi.advanceTimersByTimeAsync(600);
    expect(view.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(5000, "user:7");
  }
});
