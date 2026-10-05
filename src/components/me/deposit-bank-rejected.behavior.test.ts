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
const setupSource = descriptor.scriptSetup!.content
  .replace(/\/\/ #ifdef H5\r?\n([\s\S]*?)\/\/ #endif/g, (_all, body: string) => body)
  .replace(/\/\/ #ifndef H5\r?\n([\s\S]*?)\/\/ #endif/g, "");
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
function input(target: HostNode): HostNode | undefined {
  return target.kind === "input" ? target : target.children.map(input).find(Boolean);
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
function creationFlow(dep: { intents: DepositIntent[] }, responses: number[], storage = memoryStorage(), accountKey = "user:7", responseGate?: Promise<void>, rejectionData?: unknown, rejectionMessage?: string) {
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
    const usdtAmount = (request.body as { usdtAmount: number }).usdtAmount;
    return { status, headers: {}, data: { code: status === 200 ? 0 : status,
      message: status === 200 ? "OK" : rejectionMessage ?? (status === 503 ? "HDPAY_ORDER_SUBMIT_UNKNOWN" : "HDPAY_ORDER_CREATE_REJECTED"),
      data: status === 200 ? { intentNo: "VQR-new", usdtAmount, fxRate: quoteRate,
        vndAmount: vndForUsdt(usdtAmount, quoteRate), status: "awaiting_payment",
        createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 60_000).toISOString(),
        creditedUsdt: 0, feeVnd: 0, feeUsdt: 0, version: 1, paymentMode: "hosted",
        providerStatus: "created", paymentUrl: "https://api.hdpayadmin.com/pay?id=new" } : rejectionData ?? null } };
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
  createRecovery: Vue.Ref<"onboarding" | "terms" | null>;
  amount: Vue.Ref<string>;
  creating: Vue.Ref<boolean>;
  pageActive: Vue.Ref<boolean>;
  completeCreateOrder: (amount: number, account: string) => Promise<void>;
  openHostedOrder: (intent: DepositIntent) => void;
  goSupport: () => void;
  regen: () => void;
  goCreateRecovery: () => void;
}

function pane(providerStatus: DepositIntent["providerStatus"] = "rejected", translations: Messages = zh, shared?: { dep: unknown; app: unknown; auth?: unknown }) {
  const original: DepositIntent = {
    intentId: "VQR-existing", usdtAmount: 5000, fxRate: quoteRate, vndAmount: vndForUsdt(5000, quoteRate),
    status: "awaiting_payment", createdAt: now, expireAt: now + 6 * 60_000,
    paymentMode: "hosted", providerStatus,
    ...(providerStatus === "created" ? { paymentUrl: "https://api.hdpayadmin.com/pay?id=existing" } : {}),
  };
  const freshDep = Vue.reactive({
    intents: [original], records: [], serverStatus: "ready", serverError: "",
    bankRecoveryDraft: null as { accountKey: string; amount: string } | null,
    currentAccountKey: () => app.accountKey, createRemoteBankIntent: vi.fn(async (_amount: number, _account: string): Promise<DepositIntent> => original),
    refreshRemoteVietQrDeposits: vi.fn(async () => {}),
    startRemoteVietQrPolling: vi.fn(), stopRemoteVietQrPolling: vi.fn(),
  });
  const dep = (shared?.dep ?? freshDep) as typeof freshDep;
  const fx = Vue.reactive({ fxAvailable: true, configReady: true, vietQrEnabled: true, dailyCapacityKnown: false,
    minDepositUsdt: 10, maxDepositUsdt: 5000, todayRemainingDepositUsdt: 0,
    quoteRate, feeUsdt: 0, feeVnd: 0, lockWindowMin: 30, load: vi.fn(async () => {}) });
  const freshApp = Vue.reactive({ accountKey: "user:7", accountBindingEpoch: 1 });
  const app = (shared?.app ?? freshApp) as typeof freshApp;
  const freshAuth = Vue.reactive({ isAuthenticated: true, accountId: "user:7" });
  const auth = (shared?.auth ?? freshAuth) as typeof freshAuth;
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
    "@/store/auth": { useAuth: () => auth },
    "@/lib/binary-session-ready": { binarySessionReady: accountSessionReady },
    "@/store/fx-core": { fmtVnd, vndForUsdt }, "@/store/server-time": { mockServerNow: () => now },
    "@/store/deposits-core": { BANK_MAX_DEPOSIT_USDT: 5000, MIN_DEPOSIT_USDT: 10 },
    "@/api/runtime": { remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: Number(auth.accountId.slice(5)) } }) } },
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
  const dispose = () => { unmounted.forEach(callback => callback()); scope.stop(); };
  cleanups.push(dispose);
  const definition = () => ({
    components: { FxRateLine: { render: () => null } }, setup: () => ({ ...state, fmt, fmtVnd }), render,
  });
  return { state, dep, fx, app, auth, navTo, open, toast, html: () => renderToString(Vue.createSSRApp(definition())),
    mount: () => {
      const root = node("root"), app = renderer.createApp(definition());
      app.mount(root); cleanups.push(() => app.unmount());
      return { root, retry: () => action(root, "nx-bank-regen-cta"), unmount: () => { app.unmount(); dispose(); } };
    } };
}

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.useRealTimers(); vi.restoreAllMocks(); });

test.each([zh, en, vietnamese])("a bounded CREATE provider reason keeps explicit source and original retry behavior", async messages => {
  const view = pane("rejected", messages), mounted = view.mount();
  const providerReason = "充值金额不正确：请输入整数";
  const flow = creationFlow(view.dep, [422], memoryStorage(), "user:7", undefined, { providerReason });
  view.dep.createRemoteBankIntent.mockImplementation(flow.create);
  click(mounted.retry()!);
  await vi.advanceTimersByTimeAsync(600); await Vue.nextTick();
  expect(view.state.createError.value).toContain(providerReason);
  const copy = `${messages.bankPane.hostedRejectedNote}\n${fmt(messages.bankPane.providerReason, { reason: providerReason })}`;
  expect(view.state.createError.value).toBe(copy);
  expect(await view.html()).toContain(fmt(messages.bankPane.providerReason, { reason: providerReason }));
  expect(view.toast.error).toHaveBeenCalledExactlyOnceWith(copy);
  expect(view.state.creating.value).toBe(false); expect(flow.requests).toHaveBeenCalledOnce();
  expect(mounted.retry()?.props["aria-disabled"]).toBe(false);
  expect(view.state.intent.value?.intentId).toBe("VQR-existing");
  expect(view.open).not.toHaveBeenCalled(); expect(view.navTo).not.toHaveBeenCalled();
  const scope = JSON.stringify(["user:7", "CREATE", "5000.000000"]);
  expect((flow.storage.read() as { pending: Record<string, unknown> }).pending[scope]).toBeUndefined();
});

test.each([zh, en, vietnamese])("a fresh pane reads the provider reason through real GET/list parser and store projection", async messages => {
  const view = pane("rejected", messages);
  const original = view.dep.intents[0];
  const snapshot = { intentNo: original.intentId, usdtAmount: original.usdtAmount, fxRate: original.fxRate,
    vndAmount: original.vndAmount, status: original.status, expiresAt: new Date(original.expireAt).toISOString(),
    createdAt: new Date(original.createdAt).toISOString(), creditedUsdt: 0, feeVnd: 0, feeUsdt: 0, version: 1,
    paymentMode: "hosted", providerStatus: "rejected", providerReason: "金额必须为整数" };
  const request = vi.fn(async (input: HttpRequest) => ({ status: 200, headers: {},
    data: { code: 0, message: "OK", data: input.url.includes("?limit=") ? { items: [snapshot] } : snapshot } }));
  const api = createPaymentApi(createApiClient({ baseUrl: "https://example.test", vault: (() => {
    const vault = createSessionVault(); vault.save({ accessToken: "unit-access", refreshToken: "unit-refresh", tokenType: "Bearer",
      user: { userId: 7, countryCode: "+86", phone: "13800000007", nickname: "Test", onboardingComplete: true } }); return vault;
  })(), transport: { request } }));
  const rows = await api.listVietQrIntents(), readback = await api.getVietQrIntent(snapshot.intentNo);
  expect(readback.providerReason).toBe(snapshot.providerReason);
  const project = new Function("snapshot", `${storeScript}; return remoteVietQrIntent(snapshot);`);
  view.dep.intents = rows.map(item => project(item));
  const copy = fmt(messages.bankPane.providerReason, { reason: snapshot.providerReason });
  expect(await view.html()).toContain(copy);
  expect(view.state.createError.value).toBe("");
  expect(request.mock.calls.every(args => args[0].method === "GET")).toBe(true);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(view.open).not.toHaveBeenCalled();
});

test.each([undefined, null, "", "a. ".repeat(86), "<script>alert(1)</script>", "amount\nprivate"])("an absent or unsafe CREATE reason retains generic guidance: %j", async providerReason => {
  const view = pane(), mounted = view.mount();
  const flow = creationFlow(view.dep, [422], memoryStorage(), "user:7", undefined, { providerReason });
  view.dep.createRemoteBankIntent.mockImplementation(flow.create);
  click(mounted.retry()!);
  await vi.advanceTimersByTimeAsync(600); await Vue.nextTick();
  expect(view.state.createError.value).toBe(zh.bankPane.hostedRejectedNote);
  expect(view.toast.error).toHaveBeenCalledExactlyOnceWith(zh.bankPane.hostedRejectedNote);
  expect(flow.requests).toHaveBeenCalledOnce(); expect(view.open).not.toHaveBeenCalled();
});

test.each([zh, en, vietnamese])("precise onboarding/terms 428 renders a normal recovery control and keeps the amount without replay", async messages => {
  for (const [reason, recovery, route, copy] of [
    ["USER_ONBOARDING_REQUIRED", "onboarding", "/pages/register/success?setup=1", messages.bankPane.onboardingRequired],
    ["LEGAL_TERMS_ACK_REQUIRED", "terms", "/pages/onboarding/terms", messages.bankPane.termsRequired],
  ] as const) {
    const view = pane("rejected", messages);
    view.dep.intents = [];
    view.state.amount.value = "20";
    view.dep.createRemoteBankIntent.mockRejectedValue(new ApiError({ kind: "http", status: 428, code: 428, message: reason }));
    const mounted = view.mount();
    await view.state.completeCreateOrder(20, "user:7");
    await Vue.nextTick();
    expect(view.state.createError.value).toBe(copy);
    expect(view.state.createRecovery.value).toBe(recovery);
    expect(view.state.amount.value).toBe("20");
    expect(view.dep.intents).toEqual([]);
    expect(view.navTo).not.toHaveBeenCalled();
    const control = action(mounted.root, "nx-bank-setup-recovery")!;
    expect(control).toBeDefined();
    click(control);
    expect(view.navTo).toHaveBeenCalledExactlyOnceWith(route);
    await vi.advanceTimersByTimeAsync(1200);
    expect(view.dep.createRemoteBankIntent).toHaveBeenCalledOnce();
    expect(view.state.amount.value).toBe("20");
    expect(view.open).not.toHaveBeenCalled();
  }
});
test.each([
  ["USER_ONBOARDING_REQUIRED", "/pages/register/success?setup=1"],
  ["LEGAL_TERMS_ACK_REQUIRED", "/pages/onboarding/terms"],
])("428 recovery preserves 20 through an actual pane unmount/remount: %s", async (reason, route) => {
  const first = pane(); first.dep.intents = [];
  first.state.amount.value = "20";
  first.dep.createRemoteBankIntent.mockRejectedValue(new ApiError({ kind: "http", status: 428, code: 428, message: reason }));
  const mounted = first.mount();
  await first.state.completeCreateOrder(20, "user:7"); await Vue.nextTick();
  click(action(mounted.root, "nx-bank-setup-recovery")!);
  expect(first.navTo).toHaveBeenCalledExactlyOnceWith(route);
  mounted.unmount();
  const returned = pane("rejected", zh, first), remounted = returned.mount();
  await vi.advanceTimersByTimeAsync(1200); await Vue.nextTick();
  expect(returned.state.amount.value).toBe("20");
  expect(await returned.html()).toContain('value="20"');
  expect(action(remounted.root, "nx-bank-setup-recovery")).toBeUndefined();
  expect(first.dep.createRemoteBankIntent).toHaveBeenCalledOnce();
  expect(returned.open).not.toHaveBeenCalled();
});

test.each(["20.00", "20.", "20.001"])("recovery keeps the raw edited amount %s through remount without changing command keys", async rawAmount => {
  const first = pane(); first.dep.intents = [];
  const flow = creationFlow(first.dep, [428, 200], memoryStorage(), "user:7", undefined, undefined, "USER_ONBOARDING_REQUIRED");
  first.dep.createRemoteBankIntent.mockImplementation(flow.create);
  const mounted = first.mount();
  (input(mounted.root)!.props.onInput as (event: unknown) => void)({ detail: { value: "20" } });
  await first.state.completeCreateOrder(20, "user:7"); await Vue.nextTick();
  (input(mounted.root)!.props.onInput as (event: unknown) => void)({ detail: { value: rawAmount } });
  click(action(mounted.root, "nx-bank-setup-recovery")!);
  const beforeReturn = structuredClone(flow.storage.read());
  mounted.unmount();
  const returned = pane("rejected", zh, first), remounted = returned.mount();
  await vi.advanceTimersByTimeAsync(1200); await Vue.nextTick();
  expect(input(remounted.root)!.props.value).toBe(rawAmount);
  expect(flow.storage.read()).toEqual(beforeReturn);
  expect(flow.requests).toHaveBeenCalledOnce();
  expect(returned.dep.intents).toEqual([]);
  if (rawAmount === "20.001") {
    expect(returned.state.amountError).toMatchObject({ value: zh.bankPane.amountFormatError });
  } else {
    click(action(remounted.root, "nx-bank-create-cta")!);
    await vi.advanceTimersByTimeAsync(600); await Vue.nextTick();
    expect(flow.requests).toHaveBeenCalledTimes(2);
    expect(flow.requests.mock.calls[1][0].body).toMatchObject({ usdtAmount: 20 });
    expect(returned.dep.bankRecoveryDraft).toBeNull();
  }
});

test("account changes clear the visible recovery input and reject another account's remount draft", async () => {
  const first = pane(); first.dep.intents = [];
  first.state.amount.value = "20";
  first.dep.createRemoteBankIntent.mockRejectedValue(new ApiError({ kind: "http", status: 428, code: 428, message: "USER_ONBOARDING_REQUIRED" }));
  const mounted = first.mount();
  await first.state.completeCreateOrder(20, "user:7"); await Vue.nextTick();
  click(action(mounted.root, "nx-bank-setup-recovery")!);
  first.auth.accountId = "user:8"; first.app.accountKey = "user:8"; first.app.accountBindingEpoch++;
  await Vue.nextTick();
  expect(input(mounted.root)!.props.value).toBe("25");
  first.state.goCreateRecovery();
  expect(first.navTo).toHaveBeenCalledOnce();
  mounted.unmount();
  const returned = pane("rejected", zh, first), remounted = returned.mount();
  expect(input(remounted.root)!.props.value).toBe("25");
  expect(first.dep.createRemoteBankIntent).toHaveBeenCalledOnce();
});

test("the real deposit binding keeps a same-account recovery draft and clears it on switch/logout", () => {
  const bankRecoveryDraft = Vue.ref<{ accountKey: string; amount: string } | null>({ accountKey: "user:7", amount: "20" });
  const state = { bankRecoveryDraft, normalizeAccountKey, fundsServerEnabled: true, timers: new Map(),
    remoteGeneration: 0, remotePollTimer: undefined, serverAccountKey: "user:7", records: Vue.ref([]), intents: Vue.ref([]),
    resetRemoteReceiptPage: vi.fn(), serverStatus: Vue.ref("ready"), serverError: Vue.ref(""),
    refreshRemoteVietQrDeposits: vi.fn(), remotePollingActive: false, startRemoteVietQrPolling: vi.fn() };
  const bindingScript = ts.transpileModule(storeMethods.get("bindAccount")!, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const bind = new Function("state", `let { ${Object.keys(state).join(", ")} } = state;\n${bindingScript}\nreturn bindAccount;`)(state) as (account: string) => void;
  bind("user:7"); expect(bankRecoveryDraft.value?.amount).toBe("20");
  bind("user:8"); expect(bankRecoveryDraft.value).toBeNull();
  bankRecoveryDraft.value = { accountKey: "user:8", amount: "30" };
  bind("default"); expect(bankRecoveryDraft.value).toBeNull();
  bind("user:7"); expect(bankRecoveryDraft.value).toBeNull();
});

test.each([
  { kind: "http" as const, status: 503, code: 428, message: "USER_ONBOARDING_REQUIRED" },
  { kind: "http" as const, status: 428, code: 999, message: "USER_ONBOARDING_REQUIRED" },
  { kind: "http" as const, status: 428, code: 428, message: "OTHER_PRECONDITION" },
  { kind: "business" as const, status: 409, code: 409, message: "RISK_DISCLOSURE_ACK_REQUIRED" },
])("does not misclassify another rejection %s as onboarding or terms", async error => {
  const view = pane(); view.dep.intents = [];
  view.dep.createRemoteBankIntent.mockRejectedValue(new ApiError(error));
  await view.state.completeCreateOrder(20, "user:7");
  expect(view.state.createRecovery.value).toBeNull();
  expect(view.navTo).not.toHaveBeenCalled();
});
test("a recovery control cannot navigate after an account epoch changes", async () => {
  const view = pane(); view.dep.intents = [];
  view.dep.createRemoteBankIntent.mockRejectedValue(new ApiError({ kind: "http", status: 428, code: 428, message: "USER_ONBOARDING_REQUIRED" }));
  await view.state.completeCreateOrder(20, "user:7");
  view.app.accountBindingEpoch++;
  await Vue.nextTick();
  view.state.goCreateRecovery();
  expect(view.state.createRecovery.value).toBeNull();
  expect(view.navTo).not.toHaveBeenCalled();
});

test.each([zh, en, vietnamese])("a resumed rejected order offers explicit retry, new top-up and support without automatic payment or POST", async (messages) => {
  const view = pane("rejected", messages);
  expect(view.state.intent.value?.intentId).toBe("VQR-existing");
  expect(view.state.paneView.value).toBe("order");
  expect(view.state.hostedRejected.value).toBe(true);
  const html = await view.html();
  expect(html).toContain(messages.bankPane.hostedRejectedNote);
  expect(messages.help.contactSupport).toBeTypeOf("string");
  expect(html).toContain(messages.help.contactSupport);
  expect(html).toContain(messages.bankPane.regenCta);
  expect(html).toContain(messages.bankPane.newTopupCta);
  expect(html).not.toContain(messages.bankPane.hostedPendingNote);
  expect(html).not.toContain(fmt(messages.bankPane.countdown, { time: "06:00" }));
  expect(html).toContain("nx-bank-regen-cta");
  expect(html).toContain("nx-bank-new-topup-cta");
  expect(html).not.toMatch(/nx-bank-(?:create|hosted-continue|cancel)-cta/);
  view.state.goSupport();
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith("/pages/me/support-tickets?mode=create&cat=deposit");
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  expect(view.open).not.toHaveBeenCalled();
  expect(view.dep.intents[0]).toMatchObject({ intentId: "VQR-existing", status: "awaiting_payment", providerStatus: "rejected" });
});

test.each(["pending", "submit_unknown", "not_submitted", undefined] as const)("%s continues to show the existing pending guidance without a new top-up entry", async (status) => {
  const view = pane(status ?? "pending");
  view.dep.intents[0].providerStatus = status;
  const html = await view.html();
  expect(html).toContain(zh.bankPane.hostedPendingNote);
  expect(html).toContain(fmt(zh.bankPane.countdown, { time: "06:00" }));
  expect(html).not.toContain(zh.bankPane.hostedRejectedNote);
  expect(html).not.toContain("nx-bank-regen-cta");
  expect(html).not.toContain("nx-bank-new-topup-cta");
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
});

test.each(["submit_unknown", "pending"] as const)("a queued rejected-order new top-up click stays on the order after polling changes it to %s", async (status) => {
  const view = pane(), mounted = view.mount();
  view.state.createError.value = zh.bankPane.hostedRejectedNote;
  await Vue.nextTick();
  const newTopup = action(mounted.root, "nx-bank-new-topup-cta")!;
  expect(newTopup).toBeDefined();
  view.dep.intents[0].providerStatus = status;
  const original = { ...view.dep.intents[0] };
  expect(action(mounted.root, "nx-bank-new-topup-cta")).toBe(newTopup);
  click(newTopup);
  expect(view.state.paneView.value).toBe("order");
  expect(view.state.intent.value?.intentId).toBe(original.intentId);
  expect(view.state.createError.value).toBe(zh.bankPane.hostedRejectedNote);
  await Vue.nextTick();
  expect(action(mounted.root, "nx-bank-new-topup-cta")).toBeUndefined();
  await vi.advanceTimersByTimeAsync(3000);
  expect(view.dep.intents).toEqual([original]);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  expect(view.open).not.toHaveBeenCalled();
});

test("the rejected-order new top-up entry preserves the order and creates a different amount only after Generate", async () => {
  const view = pane(), mounted = view.mount(), original = { ...view.dep.intents[0] };
  const flow = creationFlow(view.dep, [200]);
  view.dep.createRemoteBankIntent.mockImplementation(flow.create);
  view.state.createError.value = zh.bankPane.hostedRejectedNote;
  await Vue.nextTick();
  const newTopup = action(mounted.root, "nx-bank-new-topup-cta");
  expect(newTopup).toBeDefined();
  click(newTopup!);
  await Vue.nextTick();
  expect(view.state.paneView.value).toBe("form");
  expect(view.state.createError.value).toBe("");
  expect(errorBanner(mounted.root)).toBeUndefined();
  expect(view.dep.intents).toEqual([original]);
  const amountInput = action(mounted.root, "tabular-nums")!;
  expect(amountInput.kind).toBe("input");
  (amountInput.props.onInput as (event: unknown) => void)({ detail: { value: "26" } });
  view.dep.intents = [{ ...original }, { ...original, intentId: "VQR-older", status: "expired" }];
  await vi.advanceTimersByTimeAsync(3000);
  await Vue.nextTick();
  expect(view.state.paneView.value).toBe("form");
  expect(amountInput.props.value).toBe("26");
  expect(view.dep.intents[0]).toEqual(original);
  expect(view.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  expect(flow.requests).not.toHaveBeenCalled();
  expect(view.open).not.toHaveBeenCalled();
  const generate = action(mounted.root, "nx-bank-create-cta")!;
  expect(generate.props["aria-disabled"]).toBe(false);
  click(generate);
  await vi.advanceTimersByTimeAsync(600);
  await Vue.nextTick();
  expect(view.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(26, "user:7");
  expect(flow.requests).toHaveBeenCalledOnce();
  expect(flow.requests.mock.calls[0][0].body).toEqual({ usdtAmount: 26 });
  expect(view.state.intent.value).toMatchObject({ intentId: "VQR-new", usdtAmount: 26, providerStatus: "created" });
  expect(view.dep.intents.find(item => item.intentId === original.intentId)).toEqual(original);
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
  const newTopup = action(mounted.root, "nx-bank-new-topup-cta")!;
  expect(newTopup.props["aria-disabled"]).toBe(true);
  click(newTopup);
  expect(view.state.paneView.value).toBe("order");
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
  expect(html).not.toContain("nx-bank-new-topup-cta");
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
