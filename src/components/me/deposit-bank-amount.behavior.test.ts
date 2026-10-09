import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./deposit-bank-pane.vue?raw";
import depositsSource from "@/store/deposits.ts?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { computeQuoteRate, fmtVnd, vndForUsdt } from "@/store/fx-core";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { findResumablePaymentIntent, validateHostedPaymentUrl } from "@/lib/hosted-payment";
import { runRecoverableFundsOperation } from "@/lib/recoverable-funds-operation";
import { buildVietQrTransferSteps, isPayableVietQrCreateStatus, remoteGenerationMatches } from "@/lib/vietqr-remote-safety";
import { ApiError, isAmbiguousOutcome } from "@/api/errors";
import { createApiClient, type HttpRequest } from "@/api/api-client";
import { createPaymentApi } from "@/api/payment-api";
import { createSessionVault } from "@/api/session-vault";
import { normalizeAccountKey } from "@/store/account-cloud";
import { VietQrCommandKeyRegistry, type VietQrCommandStorage } from "@/lib/vietqr-command-key";
import type { DepositIntent } from "@/store/types";

// Compile and mount the production SFC. Only its store/transport boundary and
// native host are replaced; input parsing, guards and handlers are unchanged.
const { descriptor } = parse(source, { filename: "deposit-bank-pane.vue" });
const script = compileScript(descriptor, { id: "bank-amount-behavior", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text", "image"].includes(tag) } } });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type HostNode = { tag: string; text: string; props: Record<string, any>; parent: HostNode | null; children: HostNode[] };
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
const cleanups: Array<() => void> = [];
const now = Date.parse("2026-10-04T17:46:00Z"), quoteRate = computeQuoteRate(26000, 1.5);
const accountKey = "user:7";
const flush = async () => { for (let turn = 0; turn < 4; turn++) await Promise.resolve(); await Vue.nextTick(); };
function payment(amount: number): DepositIntent {
  return { intentId: "local-bank-intent", usdtAmount: amount, vndAmount: vndForUsdt(amount, quoteRate),
    fxRate: quoteRate, createdAt: now, expireAt: now + 30 * 60_000, status: "awaiting_payment",
    paymentMode: "manual", memoCode: "LOCAL-ONLY" };
}
async function mount(messages = en, initial?: DepositIntent) {
  const dep = Vue.reactive({ intents: initial ? [initial] : [] as DepositIntent[], records: [], remoteReceipts: [],
    remoteReceiptInitialStatus: "ready", serverStatus: "ready", serverError: "", bankRailAvailable: true,
    currentAccountKey: () => accountKey, refreshRemoteVietQrDeposits: vi.fn(async () => {}),
    startRemoteVietQrPolling: vi.fn(), stopRemoteVietQrPolling: vi.fn(),
    createRemoteBankIntent: vi.fn(async (amount: number, _expectedAccountKey: string): Promise<DepositIntent | null> => {
      const intent = payment(amount); dep.intents = [intent]; return intent;
    }) });
  const fx = Vue.reactive({ fxAvailable: true, configReady: true, vietQrEnabled: true, dailyCapacityKnown: true,
    minDepositUsdt: 10, maxDepositUsdt: 5000, todayRemainingDepositUsdt: 100,
    quoteRate, feeUsdt: 0, feeVnd: 0, lockWindowMin: 30, load: vi.fn(async () => {}) });
  const open = vi.fn(() => true), toast = { error: vi.fn(), success: vi.fn(), warn: vi.fn() };
  const modules: Record<string, unknown> = {
    vue: Vue, "@/components/me/fx-rate-line.vue": { default: Vue.defineComponent(() => () => Vue.h("aside")) },
    "@/i18n/use-t": { useT: () => Vue.ref(messages) }, "@/i18n/format": { fmt },
    "@/lib/route": { navTo: vi.fn(), navBack: vi.fn() }, "@/store/ui": { toast, confirm: vi.fn() },
    "@/store/deposits": { useDeposits: () => dep }, "@/store/fx": { useFx: () => fx },
    "@/store/app": { useApp: () => Vue.reactive({ accountKey, accountBindingEpoch: 1 }) },
    "@/store/auth": { useAuth: () => ({ isAuthenticated: true, accountId: accountKey }) },
    "@/lib/binary-session-ready": { binarySessionReady }, "@/store/fx-core": { fmtVnd, vndForUsdt },
    "@/store/server-time": { mockServerNow: () => now },
    "@/store/deposits-core": { BANK_MAX_DEPOSIT_USDT: 5000, MIN_DEPOSIT_USDT: 10 },
    "@/api/runtime": { remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: 7 } }) } },
    "@/api/errors": { ApiError }, "@/lib/recoverable-funds-operation": { runRecoverableFundsOperation },
    "@/lib/vietqr-remote-safety": { buildVietQrTransferSteps },
    "@/lib/hosted-payment": { findResumablePaymentIntent, validateHostedPaymentUrl, openHostedPaymentPage: open },
  };
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected bank amount dependency: ${id}`);
    return modules[id];
  }, exports);
  const root = node(), app = renderer.createApp(exports.default);
  app.mount(root); cleanups.push(() => app.unmount()); await flush();
  const control = (className: string) => {
    const target = nodes(root).find(entry => String(entry.props.class).split(" ").includes(className));
    if (!target) throw new Error(`Missing mounted bank control: ${className}`);
    return target;
  };
  const input = () => nodes(root).find(entry => entry.tag === "input")!;
  return { dep, fx, open, toast, control, input, text: () => textOf(root),
    enter: async (amount: string) => { input().props.onInput({ detail: { value: amount } }); await Vue.nextTick(); },
    click: async (className = "nx-bank-create-cta") => {
      control(className).props.onClick(); await vi.advanceTimersByTimeAsync(600); await flush();
  } };
}

// Execute the production create method and parsers against an in-memory local
// transport. This never contacts a server or creates a real payment order.
const storeAst = ts.createSourceFile("deposits.ts", depositsSource, ts.ScriptTarget.ES2022, true);
const methods = new Map<string, string>();
function collect(entry: ts.Node) {
  if (ts.isFunctionDeclaration(entry) && entry.name) methods.set(entry.name.text, entry.getText(storeAst));
  ts.forEachChild(entry, collect);
}
collect(storeAst);
const storeCode = ts.transpileModule(["remoteIntentStatus", "remoteVietQrIntent", "createRemoteBankIntent"].map(name => {
  const method = methods.get(name); if (!method) throw new Error(`Missing production deposit method: ${name}`); return method;
}).join("\n"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function localTransport(dep: Awaited<ReturnType<typeof mount>>["dep"], statuses = [200], gate?: Promise<void>) {
  let saved: unknown;
  const storage: VietQrCommandStorage = { read: () => saved, write: value => { saved = structuredClone(value); } };
  const registry = new VietQrCommandKeyRegistry(storage, () => "bank-amount-local-0001"), vault = createSessionVault();
  vault.save({ accessToken: "local-test-access", refreshToken: "local-test-refresh", tokenType: "Bearer",
    user: { userId: 7, countryCode: "+86", phone: "13800000007", nickname: "Test", onboardingComplete: true } });
  const requests = vi.fn(async (request: HttpRequest) => {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/api/app/deposits/vietqr/intents") {
      throw new Error(`Unexpected local payment request: ${request.method} ${request.url}`);
    }
    if (gate) await gate;
    const status = statuses.shift() ?? 200, amount = (request.body as { usdtAmount: number }).usdtAmount;
    return { status, headers: {}, data: { code: status === 200 ? 0 : status,
      message: status === 200 ? "OK" : "HDPAY_ORDER_SUBMIT_UNKNOWN", data: status === 200 ? {
        intentNo: "VQR-local-only", usdtAmount: amount, fxRate: quoteRate, vndAmount: vndForUsdt(amount, quoteRate),
        status: "awaiting_payment", createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 60_000).toISOString(),
        creditedUsdt: 0, feeVnd: 0, feeUsdt: 0, version: 1, paymentMode: "hosted", providerStatus: "created",
        paymentUrl: "https://api.hdpayadmin.com/pay?id=local-only" } : null } };
  });
  const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: requests } });
  const context = { remoteApiEnabled: true, serverAccountKey: accountKey, remoteGeneration: 1,
    normalizeAccountKey, remoteGenerationMatches, isAmbiguousOutcome, isPayableVietQrCreateStatus,
    paymentApi: createPaymentApi(client), intents: Vue.toRef(dep, "intents"),
    vietQrCommandKey: registry.getOrCreate.bind(registry), finishVietQrCommand: registry.finish.bind(registry),
    bindVietQrIntent: registry.bindIntent.bind(registry) };
  const create = new Function("context", `const { ${Object.keys(context).join(", ")} } = context;\n${storeCode}\nreturn createRemoteBankIntent;`)(context) as
    (amount: number, account: string) => Promise<DepositIntent | null>;
  dep.createRemoteBankIntent.mockImplementation(create);
  return requests;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("mounted bank top-up amount", () => {
  it.each(["0x20", "-20", "+20", "2e1", "20USD", "20.1.2", "25.123", " 20", "20 ", "20,50", "２０"])(
    "keeps invalid input visible, clears the numeric preview and blocks creation: %s", async amount => {
      const pane = await mount(); await pane.enter(amount);
      expect(pane.input().props.value).toBe(amount);
      expect(pane.text()).toContain(fmt(en.bankPane.approx, { vnd: "—" }));
      expect(pane.control("nx-bank-create-cta").props["aria-disabled"]).toBe(true);
      await pane.click(); expect(pane.dep.createRemoteBankIntent).not.toHaveBeenCalled();
    });

  it.each(["10", "100", "25", "25.", "25.1", "25.12", "0025.12"])(
    "uses the visible legal decimal for the preview and local mocked create argument: %s", async amount => {
      const pane = await mount(); await pane.enter(amount);
      expect(pane.input().props.value).toBe(amount);
      expect(pane.text()).toContain(fmt(en.bankPane.approx, { vnd: fmtVnd(vndForUsdt(Number(amount), quoteRate)) }));
      expect(pane.control("nx-bank-create-cta").props["aria-disabled"]).toBe(false);
      await pane.click(); expect(pane.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(Number(amount), accountKey);
    });

  it.each(["", "."])("keeps an incomplete decimal edit without creating an order: %s", async amount => {
    const pane = await mount(); await pane.enter(amount);
    expect(pane.input().props.value).toBe(amount);
    expect(pane.text()).toContain(fmt(en.bankPane.approx, { vnd: "—" }));
    expect(pane.text()).not.toContain(fmt(en.bankPane.minimumLimitExceeded, { min: "$10" }));
    await pane.click(); expect(pane.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  });

  it("keeps the existing leading-dot decimal edit and its minimum limit", async () => {
    const pane = await mount(); await pane.enter(".5");
    expect(pane.input().props.value).toBe(".5");
    expect(pane.text()).toContain(fmt(en.bankPane.approx, { vnd: fmtVnd(vndForUsdt(0.5, quoteRate)) }));
    expect(pane.text()).toContain(fmt(en.bankPane.minimumLimitExceeded, { min: "$10" }));
    await pane.click(); expect(pane.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  });

  it("rejects a non-finite decimal without silently substituting an amount", async () => {
    const pane = await mount(), amount = "9".repeat(400); await pane.enter(amount);
    expect(pane.input().props.value).toBe(amount); expect(pane.text()).toContain(en.bankPane.amountFormatError);
    await pane.click(); expect(pane.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  });

  it("holds the submitted visible amount while generation is in progress", async () => {
    const pane = await mount(); await pane.enter("25.12");
    pane.control("nx-bank-create-cta").props.onClick(); await Vue.nextTick();
    expect(pane.input().props.disabled).toBe(true);
    await pane.enter("-20"); expect(pane.input().props.value).toBe("25.12");
    await vi.advanceTimersByTimeAsync(600); await flush();
    expect(pane.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(25.12, accountKey);
  });

  it("holds the amount during a delayed local transport and restores editing and the same retry key after failure", async () => {
    const pane = await mount(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), requests = localTransport(pane.dep, [503, 200], gate);
    await pane.enter("25.12"); pane.control("nx-bank-create-cta").props.onClick();
    await vi.advanceTimersByTimeAsync(600); await flush();
    expect(requests).toHaveBeenCalledTimes(1); expect(pane.input().props.disabled).toBe(true);
    await pane.enter("-20"); expect(pane.input().props.value).toBe("25.12");
    release(); await vi.waitFor(() => expect(pane.input().props.disabled).toBe(false));
    expect(pane.text()).toContain(en.bankPane.createFailedNote);
    await pane.enter("25.13"); expect(pane.input().props.value).toBe("25.13"); await pane.enter("25.12");
    await pane.click(); expect(requests).toHaveBeenCalledTimes(2);
    const [first, retry] = requests.mock.calls.map(([request]) => request);
    expect(first.body).toEqual({ usdtAmount: 25.12 }); expect(retry.body).toEqual(first.body);
    expect(first.headers["Idempotency-Key"]).toBeTruthy();
    expect(retry.headers["Idempotency-Key"]).toBe(first.headers["Idempotency-Key"]);
    expect(pane.dep.intents[0].usdtAmount).toBe(25.12);
  });

  it("never reaches the production create method or local transport for illegal input", async () => {
    const pane = await mount(), requests = localTransport(pane.dep);
    for (const amount of ["0x20", "-20", "2e1", "20USD", "20.1.2", "25.123"]) {
      await pane.enter(amount); await pane.click();
    }
    expect(pane.dep.createRemoteBankIntent).not.toHaveBeenCalled(); expect(requests).not.toHaveBeenCalled();
  });

  it("sends the existing rejected order's original amount through the production method and local transport", async () => {
    const original = { ...payment(37.12), paymentMode: "hosted" as const, providerStatus: "rejected" as const };
    const pane = await mount(en, original), requests = localTransport(pane.dep);
    await pane.click("nx-bank-regen-cta");
    expect(requests).toHaveBeenCalledTimes(1); expect(requests.mock.calls[0][0].body).toEqual({ usdtAmount: 37.12 });
    expect(pane.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(37.12, accountKey);
  });

  it("recovers from an invalid edit without retaining its stripped amount", async () => {
    const pane = await mount(); await pane.enter("-20"); await pane.click();
    expect(pane.dep.createRemoteBankIntent).not.toHaveBeenCalled(); await pane.enter("25.12");
    await pane.click(); expect(pane.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(25.12, accountKey);
  });

  it.each([zh, en, vietnamese])("retains translated limits and blocks out-of-range decimals (%#)", async messages => {
    const pane = await mount(messages);
    for (const [amount, error] of [["9.99", fmt(messages.bankPane.minimumLimitExceeded, { min: "$10" })],
      ["5000.01", fmt(messages.bankPane.singleLimitExceeded, { max: "$5,000" })],
      ["100.01", fmt(messages.bankPane.dailyCapacityExceeded, { max: "$100" })]]) {
      await pane.enter(amount); expect(pane.input().props.value).toBe(amount); expect(pane.text()).toContain(error);
      expect(pane.control("nx-bank-create-cta").props["aria-disabled"]).toBe(true); await pane.click();
    }
    expect(pane.dep.createRemoteBankIntent).not.toHaveBeenCalled();
  });

  it("keeps the amount across a failed local mocked create and explicit form retry", async () => {
    const pane = await mount(); pane.dep.createRemoteBankIntent.mockRejectedValueOnce(new Error("LOCAL_ONLY_FAILURE"));
    await pane.enter("25.12"); await pane.click();
    expect(pane.input().props.value).toBe("25.12"); expect(pane.text()).toContain(en.bankPane.createFailedNote);
    expect(pane.control("nx-bank-create-cta").props["aria-disabled"]).toBe(false);
    await pane.click(); expect(pane.dep.createRemoteBankIntent.mock.calls).toEqual([[25.12, accountKey], [25.12, accountKey]]);
  });

  it("keeps an existing rejected order's original amount on explicit retry", async () => {
    const original = { ...payment(37.12), paymentMode: "hosted" as const, providerStatus: "rejected" as const };
    const pane = await mount(en, original); await pane.click("nx-bank-regen-cta");
    expect(pane.dep.createRemoteBankIntent).toHaveBeenCalledExactlyOnceWith(37.12, accountKey);
  });

  it.each([zh, en, vietnamese])("explains illegal syntax and excess precision in the active locale (%#)", async messages => {
    const pane = await mount(messages);
    for (const amount of ["-20", "25.123"]) {
      await pane.enter(amount); expect(pane.text()).toContain(messages.bankPane.amountFormatError);
      expect(pane.input().props.value).toBe(amount);
    }
  });
});
