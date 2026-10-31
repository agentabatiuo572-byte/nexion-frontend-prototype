import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import * as Vue from "vue";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import { escapeHtml } from "@vue/shared";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./tradein-sheets.vue?raw";
import chassis from "./app-chassis.vue?raw";
import tabHost from "../pages/tabs/tabs.vue?raw";
import tabFrame from "./tab-page-frame.vue?raw";
import homeTab from "../pages/index/index.vue?raw";
import earnTab from "../pages/earn/earn.vue?raw";
import storeTab from "../pages/store/store.vue?raw";
import teamTab from "../pages/team/team.vue?raw";
import meTab from "../pages/me/me.vue?raw";
import { resolvePurchaseEligibilityMessage } from "@/lib/purchase-eligibility-copy";
import { formatAmount } from "@/lib/amount-display";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { rackPurchaseEligibility } from "./store/purchase-eligibility.fixture";

const script = parse(source).descriptor.scriptSetup!.content;
const ast = ts.createSourceFile("tradein.ts", script, ts.ScriptTarget.Latest, true);
const purchase = script.slice(script.indexOf("const purchaseSnapshot ="), script.indexOf("let remoteRetireRequest ="));
const lifecycle = script.slice(script.indexOf("let remoteRetireRequest ="), script.indexOf("watch([() => app.accountKey, () => app.accountBindingEpoch],"));
const origin = script.slice(script.indexOf("watch([() => apiRuntimeConfig.environment, () => apiRuntimeConfig.baseUrl],"),
  script.indexOf("let canonicalTradeinConfigRead:"));
const targets = script.slice(script.indexOf("const remoteRetireLoadKey ="), script.indexOf("// ───────────────────────── 2. tradein"));
const actions = ast.statements.filter(ts.isFunctionDeclaration)
  .filter(node => ["hide", "openTradeinQuote", "onChooseTradein", "onConfirmTradein"].includes(node.name?.text ?? ""))
  .map(node => node.getText(ast)).join("\n");
const code = ts.transpileModule(purchase + lifecycle + origin + targets + actions, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
// The template contains existing TS assertions; compile its generated function as TS too.
const render = new Function("Vue", ts.transpileModule(compile(parse(source).descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
}).code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(Vue);
function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const allowed = { ...rackPurchaseEligibility, eligible: true, decisionCode: "ELIGIBLE", policies: [
  rackPurchaseEligibility.policies[0], { ...rackPurchaseEligibility.policies[1], eligible: true, decisionCode: "ELIGIBLE", mode: "EITHER" },
] };
const products = [
  { id: "stellarbox-s1", name: "S1", price: 500 },
  { id: "stellarbox-pro-v2", name: "Pro v2", price: 2500 },
  { id: "stellarrack-p1", name: "Rack P1", price: 4499 },
];
function quote(target = "stellarrack-p1", payableUsdt = 3250) {
  return { sourceDeviceId: 1204, sourceRowVersion: 3, targetProductNo: target,
    targetDeviceStatus: "ACTIVE", payableUsdt, discountUsdt: 1249 };
}
function eligible(sourceAllowed = true, targetProductNo = "stellarrack-p1") {
  return { enabled: true, eligible: sourceAllowed, targetProductNo, sources: [{ sourceDeviceId: 1204, eligible: sourceAllowed }] };
}
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(stop => stop()));
async function settle() { for (let index = 0; index < 12; index++) await Promise.resolve(); }
function shared() {
  const state = ref<Record<string, any>>({ kind: "none" });
  const app = reactive({ accountKey: "user:a", accountBindingEpoch: 1,
    devices: [{ id: "1204", rowVersion: 3, kind: "stellarbox-pro-v2", name: "Source", paidPriceUsdt: 2500 }] });
  const sheet = {
    hide: () => { state.value = { kind: "none" }; },
    showRetire: () => { state.value = { kind: "retire", oldDeviceId: "1204" }; },
    showTradein: (oldDeviceId = "1204", newKind = "stellarrack-p1", newPrice = 4499) => {
      state.value = { kind: "tradein", oldDeviceId, newKind, newPrice };
    },
    applyTradein: vi.fn(), showRetireBlock: vi.fn(),
  };
  const deviceE3Api = { eligibility: vi.fn(target => Promise.resolve(eligible(true, target))),
    quote: vi.fn((_: number, target: string) => Promise.resolve(quote(target))) };
  const purchaseEligibilityApi = { get: vi.fn().mockResolvedValue(allowed) };
  const readCheckoutTradein = vi.fn((): unknown => null);
  return { state, app, sheet, deviceE3Api, purchaseEligibilityApi, readCheckoutTradein };
}
function instance(context = shared(), active = true, plainRuntime = false) {
  const props = reactive({ active });
  const captureAccountScope = () => ({ accountKey: context.app.accountKey, epoch: context.app.accountBindingEpoch });
  const unmount: (() => void)[] = [];
  const deps = { ...context, computed, nextTick, ref, watch, props, remoteApiEnabled: true,
    captureAccountScope, isCurrentAccountScope: (scope: ReturnType<typeof captureAccountScope>) =>
      scope.accountKey === context.app.accountKey && scope.epoch === context.app.accountBindingEpoch,
    canonicalQuote: ref<ReturnType<typeof quote> | null>(null),
    canonicalQuoteOrigin: ref<{ environment: string; baseUrl: string } | null>(null), confirming: ref(false),
    quoteRequestGeneration: ref(0), quoteLoading: ref(false),
    remoteRetireEligibleTargets: ref(new Set<string>()), remoteRetirePayables: ref(new Map<string, number>()),
    remoteRetirePending: ref(false), remoteRetireLoadError: ref(false), remoteRetireOrigin: ref(null),
    canonicalTradeinConfig: ref({ enabled: true, requireHigherPrice: false }), canonicalTradeinConfigStatus: ref("ready"),
    apiRuntimeConfig: plainRuntime ? { environment: "dev", baseUrl: "https://test.invalid" }
      : reactive({ environment: "dev", baseUrl: "https://test.invalid" }),
    productCatalogState: reactive({ status: "ready", revision: "1" }), refreshProductCatalog: vi.fn(), loadCanonicalTradeinConfig: vi.fn(),
    PRODUCTS: products, getProduct: (id: string) => products.find(product => product.id === id),
    t: ref(zh), fmt, formatAmount, deviceName: (_: unknown, device: { name: string }) => device.name,
    tradeinView: ref({ ctaText: "Confirm" }), resolvePurchaseEligibilityMessage,
    navTo: vi.fn().mockResolvedValue(true), getCurrentPages: () => [], toast: { warn: vi.fn() },
    isDeviceTaskBlocked: () => false, onUnmounted: (callback: () => void) => unmount.push(callback),
  };
  const scope = effectScope();
  const actual = scope.run(() => new Function(...Object.keys(deps), code +
    ";return {retireView,hide,onPickTarget,retryRemoteRetireTargets,onChooseTradein,openTradeinQuote,purchaseStatus,purchaseSnapshot,purchaseRecovery,purchaseConfirmed,purchaseActionDisabled,refreshTradeinPurchaseEligibility,onConfirmTradein};")(...Object.values(deps)));
  const dispose = () => { unmount.splice(0).forEach(stop => stop()); scope.stop(); };
  cleanup.push(dispose);
  return { ...deps, actual, dispose };
}

describe("actual trade-in request concurrency and visibility", () => {
  it("rejects a late opening quote with the actual plain runtime config and releases its busy flag", async () => {
    const p = instance(shared(), true, true), pendingQuote = deferred(), pendingPurchase = deferred();
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    p.deviceE3Api.quote.mockReturnValueOnce(pendingQuote.promise); p.purchaseEligibilityApi.get.mockReturnValueOnce(pendingPurchase.promise);
    const opening = p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499);
    p.apiRuntimeConfig.baseUrl = "https://other-test.invalid";
    pendingQuote.resolve(quote()); pendingPurchase.resolve(allowed); await opening; await settle();
    expect(p.state.value.kind).toBe("choice"); expect(p.canonicalQuote.value).toBeNull();
    expect(p.quoteLoading.value).toBe(false); expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });

  it("rejects old list completions and selections when a plain runtime origin changes", async () => {
    const p = instance(shared(), true, true), pending = deferred();
    p.deviceE3Api.quote.mockReturnValue(pending.promise);
    p.sheet.showRetire(); await settle();
    expect(p.remoteRetireEligibleTargets.value.size).toBe(products.length);
    const quoteReads = p.deviceE3Api.quote.mock.calls.length;
    p.apiRuntimeConfig.baseUrl = "https://other-test.invalid";
    p.actual.onPickTarget("stellarrack-p1");
    expect(p.deviceE3Api.quote).toHaveBeenCalledTimes(quoteReads); expect(p.purchaseEligibilityApi.get).not.toHaveBeenCalled();
    pending.resolve(quote()); await settle();
    expect(p.remoteRetireEligibleTargets.value.size).toBe(0); expect(p.remoteRetirePayables.value.size).toBe(0);
    expect(p.actual.retireView.value).toMatchObject({ loading: false, retry: true, targets: [] });
  });

  it("rejects an old in-flight purchase grant with a plain runtime origin", async () => {
    const p = instance(shared(), true, true), pending = deferred();
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    p.purchaseEligibilityApi.get.mockReturnValueOnce(pending.promise);
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499);
    expect(p.actual.purchaseStatus.value).toBe("loading");
    p.apiRuntimeConfig.baseUrl = "https://other-test.invalid";
    pending.resolve(allowed); await settle();
    expect(p.actual.purchaseSnapshot.value).toBeNull(); expect(p.actual.purchaseConfirmed.value).toBe(false);
    expect(p.actual.purchaseStatus.value).toBe("error"); expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });

  it("checks the quote's captured plain origin again at the confirmation click", async () => {
    const p = instance(shared(), true, true);
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499); await settle();
    expect(p.actual.purchaseConfirmed.value).toBe(true);
    p.apiRuntimeConfig.baseUrl = "https://other-test.invalid";
    await p.actual.onConfirmTradein();
    expect(p.canonicalQuote.value).toBeNull(); expect(p.actual.purchaseConfirmed.value).toBe(false);
    expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });

  it("rejects a conditions return captured under a previous plain runtime origin", async () => {
    const p = instance(shared(), true, true); p.purchaseEligibilityApi.get.mockResolvedValue(rackPurchaseEligibility);
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499); await settle();
    await p.actual.onConfirmTradein(); expect(p.state.value.kind).toBe("none");
    p.apiRuntimeConfig.baseUrl = "https://other-test.invalid";
    p.props.active = false; p.props.active = true; await settle();
    expect(p.state.value.kind).toBe("none"); expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });
  it.each([zh, en, vietnamese])("renders distinct loading, retryable failure and empty copy in every locale", async copy => {
    const p = instance(); p.t.value = copy;
    p.canonicalTradeinConfig.value = null as any; p.canonicalTradeinConfigStatus.value = "loading";
    p.sheet.showRetire();
    const show = () => renderToString(Vue.createSSRApp({ render,
      components: { PurchaseEligibilityPanel: { render: () => null } }, setup: () => Vue.proxyRefs({ ...p, ...p.actual,
      active: true, capacityRecovery: null, capacityRecoveryUnavailable: false, keepRecoveryError: false,
      onKeyboardActivate: () => {},
    }) }));
    const loading = await show();
    expect(loading).toContain(copy.store.purchaseEligibilityLoading);
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain(copy.store.purchaseEligibilityError);
    expect(loading).not.toContain(copy.tradein.errPleaseRetry);
    p.canonicalTradeinConfigStatus.value = "error";
    const error = await show();
    expect(error).toContain(escapeHtml(copy.store.purchaseEligibilityError));
    expect(error).toContain(copy.store.purchaseEligibilityRetry);
    p.canonicalTradeinConfigStatus.value = "ready";
    p.canonicalTradeinConfig.value = { enabled: false, requireHigherPrice: true };
    const empty = await show();
    expect(empty).toContain(copy.tradein.retireNoTargets);
    expect(empty).not.toContain(copy.store.purchaseEligibilityRetry);
  });
  it.each(["catalog", "config"])("shows loading for pending %s and offers recovery only on a real error", async dependency => {
    const p = instance();
    if (dependency === "catalog") p.productCatalogState.status = "loading";
    else { p.canonicalTradeinConfig.value = null as any; p.canonicalTradeinConfigStatus.value = "loading"; }
    p.sheet.showRetire(); await settle();
    expect(p.actual.retireView.value).toMatchObject({ subtitle: zh.store.purchaseEligibilityLoading, loading: true, retry: false, targets: [] });
    p.actual.onPickTarget("stellarrack-p1");
    expect(p.deviceE3Api.quote).not.toHaveBeenCalled(); expect(p.purchaseEligibilityApi.get).not.toHaveBeenCalled();
    if (dependency === "catalog") p.productCatalogState.status = "error";
    else p.canonicalTradeinConfigStatus.value = "error";
    expect(p.actual.retireView.value).toMatchObject({ subtitle: zh.store.purchaseEligibilityError, loading: false, retry: true });
    p.actual.retryRemoteRetireTargets();
    if (dependency === "catalog") expect(p.refreshProductCatalog).toHaveBeenCalledExactlyOnceWith();
    else expect(p.loadCanonicalTradeinConfig).toHaveBeenLastCalledWith(true);
    if (dependency === "catalog") p.productCatalogState.status = "ready";
    else { p.canonicalTradeinConfigStatus.value = "ready"; p.canonicalTradeinConfig.value = { enabled: true, requireHigherPrice: false }; }
    await settle(); expect(p.actual.retireView.value.targets).toHaveLength(products.length);
    expect(p.actual.retireView.value.loading).toBe(false); expect(p.actual.retireView.value.retry).toBe(false);
  });

  it("keeps a successful denial loading until all candidates finish, then shows a legal empty state", async () => {
    const p = instance(), slow = deferred();
    p.deviceE3Api.eligibility.mockImplementation(target => target === "stellarrack-p1" ? slow.promise
      : Promise.resolve(eligible(false, target)));
    p.sheet.showRetire(); await settle();
    expect(p.actual.retireView.value).toMatchObject({ subtitle: zh.store.purchaseEligibilityLoading, loading: true, retry: false, targets: [] });
    slow.resolve(eligible(false)); await settle();
    expect(p.actual.retireView.value).toMatchObject({ subtitle: zh.tradein.retireNoTargets, loading: false, retry: false, targets: [] });
    expect(p.deviceE3Api.quote).not.toHaveBeenCalled();
  });

  it("distinguishes a failed candidate from a denial and retries without reopening", async () => {
    const p = instance();
    p.deviceE3Api.eligibility.mockImplementation(target => target === "stellarrack-p1" ? Promise.reject(new Error("unavailable"))
      : Promise.resolve(eligible(false, target)));
    p.sheet.showRetire(); await settle();
    expect(p.actual.retireView.value).toMatchObject({ subtitle: zh.store.purchaseEligibilityError, loading: false, retry: true, targets: [] });
    p.deviceE3Api.eligibility.mockImplementation(target => Promise.resolve(eligible(true, target)));
    p.actual.retryRemoteRetireTargets();
    expect(p.actual.retireView.value.loading).toBe(true);
    await settle(); expect(p.actual.retireView.value.targets).toHaveLength(products.length);
    expect(p.actual.retireView.value.retry).toBe(false);
  });

  it("preserves authorized rows and unknown quotes when other reads fail", async () => {
    const p = instance(), slow = deferred();
    p.deviceE3Api.eligibility.mockImplementation(target => target === "stellarbox-s1" ? slow.promise
      : target === "stellarbox-pro-v2" ? Promise.reject(new Error("eligibility unavailable")) : Promise.resolve(eligible()));
    p.deviceE3Api.quote.mockRejectedValue(new Error("quote unavailable"));
    p.sheet.showRetire(); await settle();
    expect(p.actual.retireView.value.targets.map((row: any) => row.id)).toEqual(["stellarrack-p1"]);
    expect(p.actual.retireView.value.statusText).toBe(zh.store.purchaseEligibilityLoading);
    expect(p.actual.retireView.value.retry).toBe(false);
    slow.resolve(eligible(false, "stellarbox-s1")); await settle();
    expect(p.actual.retireView.value.targets[0].label).toContain("—");
    expect(p.actual.retireView.value.statusText).toBe(zh.store.purchaseEligibilityError);
    expect(p.actual.retireView.value.retry).toBe(true);
    expect(p.purchaseEligibilityApi.get).not.toHaveBeenCalled(); expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });

  it.each(["disabled", "target"])("keeps a contradictory %s response from granting a target", async change => {
    const p = instance();
    p.deviceE3Api.eligibility.mockImplementation(target => Promise.resolve({ ...eligible(true, target),
      ...(change === "disabled" ? { enabled: false } : { targetProductNo: "different" }) }));
    p.sheet.showRetire(); await settle();
    expect(p.actual.retireView.value.targets).toHaveLength(0);
    expect(p.deviceE3Api.quote).not.toHaveBeenCalled();
    p.actual.onPickTarget("stellarrack-p1"); expect(p.purchaseEligibilityApi.get).not.toHaveBeenCalled();
    expect(p.actual.retireView.value.subtitle).toBe(change === "disabled" ? zh.tradein.retireNoTargets : zh.store.purchaseEligibilityError);
  });

  it.each(["environment", "lifecycle", "catalog"])("ignores a previous list after %s changes", async change => {
    const p = instance(), pending = deferred();
    p.deviceE3Api.eligibility.mockReturnValue(pending.promise); p.sheet.showRetire();
    p.deviceE3Api.eligibility.mockRejectedValue(new Error("new list unavailable"));
    if (change === "environment") p.apiRuntimeConfig.baseUrl = "https://other-test.invalid";
    if (change === "lifecycle") (p.app.devices[0] as any).pendingDeactivate = true;
    if (change === "catalog") p.productCatalogState.revision = "2";
    pending.resolve(eligible()); await settle();
    expect(p.actual.retireView.value.targets).toHaveLength(0);
    expect(p.deviceE3Api.quote).not.toHaveBeenCalled();
  });

  it("gates the tab host and issues only one visible instance's target requests", async () => {
    expect(chassis).toContain('<TradeinSheets :active="pageVisible && hostVisible" />');
    expect(tabHost).toContain("provide(TAB_HOST, true)");
    expect(tabHost).toContain(':host-visible="visible"');
    expect(tabFrame).toContain("const hosted = inject(TAB_HOST, false)");
    expect(tabFrame.match(/<template v-if="hosted">([\s\S]*?)<\/template>/)?.[1]).not.toContain("AppChassis");
    for (const tab of [homeTab, earnTab, storeTab, teamTab, meTab]) {
      expect(tab).toMatch(/import AppChassis from ["']@\/components\/tab-page-frame.vue["']/);
    }
    const context = shared();
    const visible = instance(context), hidden = instance(context, false), other = instance(context, false);
    context.sheet.showRetire(); await settle();
    expect(context.deviceE3Api.eligibility).toHaveBeenCalledTimes(products.length);
    expect(context.deviceE3Api.quote).toHaveBeenCalledTimes(products.length);
    expect(visible.actual.retireView.value.targets).toHaveLength(products.length);
    expect(hidden.remoteRetireEligibleTargets.value.size).toBe(0);
    expect(other.remoteRetireEligibleTargets.value.size).toBe(0);
    await hidden.actual.openTradeinQuote(context.app.devices[0], "stellarrack-p1", 4499);
    expect(context.purchaseEligibilityApi.get).not.toHaveBeenCalled();
  });

  it("publishes each authorized target and its quote without waiting for other targets", async () => {
    const p = instance();
    const slowEligibility = deferred(), slowQuote = deferred();
    p.deviceE3Api.eligibility.mockImplementation(target => target === "stellarbox-s1"
      ? slowEligibility.promise : Promise.resolve(eligible(target === "stellarrack-p1", target)));
    p.deviceE3Api.quote.mockReturnValue(slowQuote.promise);
    p.sheet.showRetire(); await settle();
    expect(p.actual.retireView.value.targets.map((row: any) => row.id)).toEqual(["stellarrack-p1"]);
    expect(p.actual.retireView.value.targets[0].label).toContain("—");
    expect(p.deviceE3Api.quote).toHaveBeenCalledExactlyOnceWith(1204, "stellarrack-p1");
    slowQuote.resolve(quote("stellarrack-p1", 3250)); await settle();
    expect(p.actual.retireView.value.targets[0].label).toContain(formatAmount(3250));
    slowEligibility.reject(new Error("unavailable")); await settle();
    expect(p.actual.retireView.value.targets.map((row: any) => row.id)).toEqual(["stellarrack-p1"]);
    p.actual.onPickTarget("stellarbox-pro-v2");
    expect(p.purchaseEligibilityApi.get).not.toHaveBeenCalled();
  });

  it.each(["hide", "close", "unmount", "rebind", "account", "version"])("does not continue stale list reads after %s", async change => {
    const p = instance(), pending = deferred();
    p.deviceE3Api.eligibility.mockReturnValue(pending.promise);
    p.sheet.showRetire();
    // Any restarted batch fails independently; only the original batch resolves.
    p.deviceE3Api.eligibility.mockRejectedValue(new Error("new batch unavailable"));
    if (change === "hide") { p.props.active = false; p.props.active = true; }
    if (change === "close") { p.actual.hide(); p.sheet.showRetire(); }
    if (change === "unmount") p.dispose();
    if (change === "rebind") p.app.accountBindingEpoch++;
    if (change === "account") p.app.accountKey = "user:b";
    if (change === "version") p.app.devices[0].rowVersion++;
    pending.resolve(eligible()); await settle();
    expect(p.deviceE3Api.quote).not.toHaveBeenCalled();
    expect(p.remoteRetireEligibleTargets.value.size).toBe(0);
  });

  it("restarts a replaced same-source list and ignores a late quote from the old list", async () => {
    const p = instance(), oldQuote = deferred();
    p.deviceE3Api.quote.mockReturnValue(oldQuote.promise);
    p.sheet.showRetire(); await settle();
    expect(p.remoteRetireEligibleTargets.value.size).toBe(products.length);
    p.deviceE3Api.quote.mockImplementation((_: number, target: string) => Promise.resolve(quote(target, 3100)));
    p.sheet.showRetire(); await settle();
    oldQuote.resolve(quote("stellarrack-p1", 3250)); await settle();
    expect(p.deviceE3Api.eligibility).toHaveBeenCalledTimes(products.length * 2);
    expect([...p.remoteRetirePayables.value.values()]).toEqual([3100, 3100, 3100]);
  });

  it("keeps failed quotes unknown and retries a fully failed list by reopening", async () => {
    const p = instance();
    p.deviceE3Api.eligibility.mockRejectedValue(new Error("eligibility unavailable"));
    p.sheet.showRetire(); await settle();
    expect(p.actual.retireView.value.targets).toHaveLength(0);
    expect(p.actual.retireView.value.subtitle).toBe(zh.store.purchaseEligibilityError);
    p.actual.hide(); p.deviceE3Api.eligibility.mockImplementation(target => Promise.resolve(eligible(true, target)));
    p.deviceE3Api.quote.mockRejectedValue(new Error("quote unavailable"));
    p.sheet.showRetire(); await settle();
    expect(p.actual.retireView.value.targets).toHaveLength(products.length);
    expect(p.actual.retireView.value.targets.every((row: any) => row.label.includes("—"))).toBe(true);
    expect(p.remoteRetirePayables.value.size).toBe(0);
  });

  it("finishes an empty higher-price candidate list without a false read error", () => {
    const p = instance();
    p.canonicalTradeinConfig.value.requireHigherPrice = true;
    p.app.devices[0].paidPriceUsdt = 10000;
    p.sheet.showRetire();
    expect(p.remoteRetirePending.value).toBe(false);
    expect(p.actual.retireView.value.targets).toHaveLength(0);
    expect(p.actual.retireView.value.subtitle).not.toBe(zh.tradein.errPleaseRetry);
    expect(p.deviceE3Api.eligibility).not.toHaveBeenCalled();
  });

  it("starts quote and complete purchase eligibility together and consumes the opening read once", async () => {
    const p = instance(), pendingQuote = deferred(), pendingPurchase = deferred();
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    p.deviceE3Api.quote.mockReturnValueOnce(pendingQuote.promise);
    p.purchaseEligibilityApi.get.mockReturnValueOnce(pendingPurchase.promise);
    const opening = p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499);
    expect(p.deviceE3Api.quote).toHaveBeenCalledExactlyOnceWith(1204, "stellarrack-p1");
    expect(p.purchaseEligibilityApi.get).toHaveBeenCalledExactlyOnceWith("stellarrack-p1");
    expect(p.deviceE3Api.eligibility).not.toHaveBeenCalled();
    pendingQuote.resolve(quote()); await opening;
    expect(p.state.value.kind).toBe("tradein");
    expect(p.actual.purchaseStatus.value).toBe("loading");
    expect(p.actual.purchaseActionDisabled.value).toBe(true);
    pendingPurchase.resolve(allowed); await settle();
    expect(p.actual.purchaseConfirmed.value).toBe(true);
    expect(p.purchaseEligibilityApi.get).toHaveBeenCalledTimes(1);
    p.purchaseEligibilityApi.get.mockResolvedValueOnce(rackPurchaseEligibility);
    await p.actual.onConfirmTradein();
    expect(p.purchaseEligibilityApi.get).toHaveBeenCalledTimes(2);
    expect(p.sheet.applyTradein).not.toHaveBeenCalled();
    expect(p.actual.purchaseConfirmed.value).toBe(false);
  });

  it.each(["hide", "close", "rebind", "account", "version", "target", "environment", "origin", "unmount"])("never applies an old opening quote after %s", async change => {
    const p = instance(), pendingQuote = deferred(), pendingPurchase = deferred();
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    p.deviceE3Api.quote.mockReturnValueOnce(pendingQuote.promise);
    p.purchaseEligibilityApi.get.mockReturnValueOnce(pendingPurchase.promise);
    const opening = p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499);
    if (change === "hide") { p.props.active = false; p.props.active = true; }
    if (change === "close") { p.actual.hide(); p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] }; }
    if (change === "rebind") p.app.accountBindingEpoch++;
    if (change === "account") p.app.accountKey = "user:b";
    if (change === "version") p.app.devices[0].rowVersion++;
    if (change === "target") p.state.value = { kind: "choice", targetKind: "stellarbox-s1", newPrice: 500, tradeInSources: ["1204"] };
    if (change === "environment") p.apiRuntimeConfig.environment = "prod";
    if (change === "origin") p.apiRuntimeConfig.baseUrl = "https://other-test.invalid";
    if (change === "unmount") p.dispose();
    pendingQuote.resolve(quote()); pendingPurchase.resolve(allowed); await opening; await settle();
    expect(p.state.value.kind).not.toBe("tradein");
    expect(p.canonicalQuote.value).toBeNull();
    expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });

  it("keeps old quote and eligibility completions from replacing a reopened selection", async () => {
    const p = instance(), oldQuote = deferred(), oldPurchase = deferred();
    const choice = () => { p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] }; };
    choice(); p.deviceE3Api.quote.mockReturnValueOnce(oldQuote.promise); p.purchaseEligibilityApi.get.mockReturnValueOnce(oldPurchase.promise);
    const oldOpening = p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499);
    p.actual.hide(); choice();
    p.deviceE3Api.quote.mockResolvedValueOnce(quote("stellarrack-p1", 3100));
    p.purchaseEligibilityApi.get.mockResolvedValueOnce(rackPurchaseEligibility);
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499); await settle();
    oldQuote.resolve(quote()); oldPurchase.resolve(allowed); await oldOpening; await settle();
    expect(p.canonicalQuote.value?.payableUsdt).toBe(3100);
    expect(p.actual.purchaseSnapshot.value).toEqual(rackPurchaseEligibility);
    expect(p.actual.purchaseConfirmed.value).toBe(false);
    expect(p.purchaseEligibilityApi.get).toHaveBeenCalledTimes(2);
  });

  it("does not revive a pending opening grant after hiding and showing the quoted sheet", async () => {
    const p = instance(), oldPurchase = deferred();
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    p.purchaseEligibilityApi.get.mockReturnValueOnce(oldPurchase.promise);
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499);
    p.purchaseEligibilityApi.get.mockResolvedValueOnce(rackPurchaseEligibility);
    p.props.active = false; p.props.active = true; await settle();
    oldPurchase.resolve(allowed); await settle();
    expect(p.purchaseEligibilityApi.get).toHaveBeenCalledTimes(2);
    expect(p.actual.purchaseSnapshot.value).toEqual(rackPurchaseEligibility);
    expect(p.actual.purchaseConfirmed.value).toBe(false);
  });

  it("revokes the confirmed purchase scope when the environment origin changes", async () => {
    const p = instance();
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499); await settle();
    expect(p.actual.purchaseConfirmed.value).toBe(true);
    p.apiRuntimeConfig.baseUrl = "https://other-test.invalid"; await settle();
    expect(p.canonicalQuote.value).toBeNull(); expect(p.actual.purchaseSnapshot.value).toBeNull();
    expect(p.actual.purchaseConfirmed.value).toBe(false);
    await p.actual.onConfirmTradein(); expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });

  it("does not restore the previous environment's quote after returning from conditions", async () => {
    const p = instance(); p.purchaseEligibilityApi.get.mockResolvedValue(rackPurchaseEligibility);
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499); await settle();
    await p.actual.onConfirmTradein(); expect(p.state.value.kind).toBe("none");
    p.apiRuntimeConfig.baseUrl = "https://other-test.invalid";
    p.props.active = false; p.props.active = true; await settle();
    expect(p.state.value.kind).toBe("none"); expect(p.canonicalQuote.value).toBeNull();
    expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });

  it.each(["source", "version", "target"])("rejects an opening quote with a different %s", async change => {
    const p = instance();
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    p.deviceE3Api.quote.mockResolvedValueOnce({ ...quote(),
      ...(change === "source" ? { sourceDeviceId: 1300 } : change === "version" ? { sourceRowVersion: 4 } : { targetProductNo: "stellarbox-s1" }) });
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499); await settle();
    expect(p.state.value.kind).toBe("choice"); expect(p.canonicalQuote.value).toBeNull();
    expect(p.actual.purchaseConfirmed.value).toBe(false); expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });

  it.each(["before", "after"])("consumes purchase rejection %s a failed quote and allows a clean retry", async timing => {
    const p = instance(), pendingQuote = deferred(), pendingPurchase = deferred();
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    p.deviceE3Api.quote.mockReturnValueOnce(pendingQuote.promise); p.purchaseEligibilityApi.get.mockReturnValueOnce(pendingPurchase.promise);
    const opening = p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499);
    if (timing === "before") { pendingPurchase.reject(new Error("purchase unavailable")); await settle(); }
    pendingQuote.reject(new Error("quote unavailable")); await opening;
    if (timing === "after") { pendingPurchase.reject(new Error("purchase unavailable")); await settle(); }
    expect(p.quoteLoading.value).toBe(false); expect(p.canonicalQuote.value).toBeNull();
    expect(p.sheet.applyTradein).not.toHaveBeenCalled();
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499); await settle();
    expect(p.actual.purchaseConfirmed.value).toBe(true);
  });

  it("shows a retryable purchase error when the quote succeeds and does not reuse the failed read", async () => {
    const p = instance();
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    p.purchaseEligibilityApi.get.mockRejectedValueOnce(new Error("purchase unavailable"));
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499); await settle();
    expect(p.actual.purchaseStatus.value).toBe("error"); expect(p.actual.purchaseConfirmed.value).toBe(false);
    await p.actual.onConfirmTradein();
    expect(p.purchaseEligibilityApi.get).toHaveBeenCalledTimes(2);
    expect(p.sheet.applyTradein).not.toHaveBeenCalled();
    expect(p.actual.purchaseConfirmed.value).toBe(true);
  });

  it("prioritizes an existing transaction before both new opening reads", async () => {
    const p = instance();
    p.state.value = { kind: "choice", targetKind: "stellarrack-p1", newPrice: 4499, tradeInSources: ["1204"] };
    p.readCheckoutTradein.mockReturnValue({ commandKey: "existing" });
    await p.actual.openTradeinQuote(p.app.devices[0], "stellarrack-p1", 4499);
    expect(p.actual.purchaseRecovery.value).toBe("pending");
    expect(p.deviceE3Api.quote).not.toHaveBeenCalled(); expect(p.purchaseEligibilityApi.get).not.toHaveBeenCalled();
  });
});
