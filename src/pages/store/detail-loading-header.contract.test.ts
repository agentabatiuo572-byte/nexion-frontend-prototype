import { dayOnePageObservationFixture } from "@/lib/day-one-page-observation.test-support";
import { formatAmount } from "@/lib/amount-display";
// Execute the production SFC setup: header/product computeds, retry and CTA guards
// stay real. Only page notifications and remote/decorative dependencies are adapted.
import { compile } from "@vue/compiler-dom";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import * as Vue from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./detail.vue?raw";
import { fmt, fmtMoney } from "@/i18n/format";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import type { Product } from "@/mock/products";
import { PURCHASE_ELIGIBILITY_SOURCE, type PurchaseEligibilitySnapshot } from "@/api/purchase-eligibility-api";
import { purchaseEligibilityPolicyHasNoRestriction, purchaseEligibilityUnlockHref, resolvePurchaseEligibilityMessage } from "@/lib/purchase-eligibility-copy";
import * as promotionEntry from "@/lib/promotion-entry";
import { localized } from "@/lib/promotion-display";

const { descriptor } = parse(source, { filename: "detail.vue" });
const script = compileScript(descriptor, { id: "detail-loading-header" });
const code = ts.transpileModule(script.content, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const renderCode = compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => tag === "view" || tag === "text",
}).code;
const render = new Function("Vue", ts.transpileModule(renderCode, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
} }).outputText)(Vue);
const teardowns: Array<() => void> = [];
afterEach(() => { for (const teardown of teardowns.splice(0)) teardown(); });
const cloud: Product = { id: "cloud-share", name: "Cloud Share", tier: "Share", tagline: "Cloud share",
  productType: "SHARE", inventoryMode: "UNLIMITED", price: 19.9, dailyEarn: 0,
  dailyEarnNEX: 3, shareYieldMin: 8, shareYieldMax: 12, sold: 1, features: [], available: true };
const copies = [["en", en], ["zh", zh], ["vi", vietnamese]] as const;
type Status = "loading" | "ready" | "error";

function page(copy = en, fallback = "") {
  const catalog = Vue.reactive<{ status: Status }>({ status: "loading" });
  // Retained presentation must not grant a product/title/CTA during a failed read.
  const presentation = Vue.shallowRef({ products: [cloud] });
  const translations = Vue.ref(copy);
  const loads: Array<(options: Record<string, string>) => Promise<void>> = [];
  const unloads: Array<() => void> = [];
  const unmounts: Array<() => void> = [];
  const reads: Array<(ok: boolean, products?: Product[]) => void> = [];
  const refresh = vi.fn(() => {
    catalog.status = "loading";
    return new Promise<boolean>(resolve => reads.push((ok, products = [cloud]) => {
      if (ok) presentation.value = { products };
      catalog.status = ok ? "ready" : "error";
      resolve(ok);
    }));
  });
  const eligibility = Vue.ref<{ status: string; eligible: boolean; snapshot: PurchaseEligibilitySnapshot | null }>({ status: "loading", eligible: false, snapshot: null });
  const cta = Vue.shallowRef<Record<string, unknown> | null>(null);
  const sticky = { activate() {}, hide: () => { cta.value = null; },
    show: (value: Record<string, unknown>) => { cta.value = value; } };
  let header!: Vue.ComputedRef<{ title: string; subtitle?: string; backHref: string }>;
  const getProduct = vi.fn(() => { throw new Error("Remote detail must not borrow a mock product"); });
  const app = Vue.reactive({ accountKey: "user:3778", accountBindingEpoch: 1, remoteFleetHasSnapshot: false,
    remoteSlotsUsed: null as number | null, slotCap: 6, captureRemoteAccountRequest: () => ({}), refreshRemoteFleet: vi.fn(async () => true) });
  const dependencies: Record<string, unknown> = {
    "@/lib/amount-display": { formatAmount },
    "@/lib/day-one-page-observation": dayOnePageObservationFixture(),
    vue: { ...Vue, onUnmounted: (callback: () => void) => unmounts.push(callback) },
    "@dcloudio/uni-app": { onLoad: (callback: typeof loads[number]) => loads.push(callback), onShow() {}, onHide() {},
      onUnload: (callback: () => void) => unloads.push(callback) },
    "@/lib/route": { navTo: vi.fn(), takeNavigationQuery: () => fallback },
    "@/composables/use-promotion-context": { usePromotionContext: () => ({ activity: Vue.ref(null), status: Vue.ref("idle"), available: Vue.ref(false), refresh: vi.fn() }) },
    "@/lib/promotion-entry": promotionEntry, "@/lib/promotion-display": { localized },
    "@/i18n/use-t": { useT: () => translations }, "@/store/locale": { useLocaleStore: () => ({ code: "en" }) },
    "@/i18n/format": { fmt, fmtMoney }, "@/lib/brand-copy": { nexGridBrandText: (value: string) => value },
    "@/mock/products": { getProduct }, "@/composables/use-product-phase": { useProductPhase: () => Vue.ref("P1") },
    "@/store/product-availability": { isProductAvailable: (product: Product) => product.available !== false },
    "@/composables/use-page-header": { useSetPageHeader: (getter: () => typeof header.value) => { header = Vue.computed(getter); } },
    "@/store/sticky-cta-bar": { useStickyCTA: () => sticky },
    "@/store/earn-config": { useEarnConfig: () => ({ taskPricing: Vue.ref(null), refresh: async () => {} }) },
    "@/lib/product-copy": { productCopy: () => ({ tagline: "", badge: "", unlocks: "" }),
      localizedDatacenterValue: (value: string) => value, specText: (_copy: unknown, value: string) => value ?? "",
      specRow: () => null },
    "@/mock/phone-tiers": { getPhoneTierYields: () => [] },
    "@/lib/store-upgrade": { activePhoneDailyRate: () => 0, storeYieldMultiplier: () => 0 },
    "@/store/product-catalog": { productCatalogState: catalog, productCatalogPresentation: presentation, refreshProductCatalog: refresh },
    "@/store/app": { useApp: () => app },
    "@/store/server-product-phase": { refreshServerProductPhase: async () => true },
    "@/api/runtime": { remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: 3778 } }) } }, "@/store/ui": { toast: { error: vi.fn() } },
    "@/lib/account-scope": { captureAccountScope: () => ({}), isCurrentAccountScope: () => true },
    "@/lib/authenticated-page-observation": {}, "@/composables/use-purchase-gate": {},
    "@/store/purchase-eligibility": { useRemotePurchaseEligibility: () => ({ eligibility, retry: vi.fn() }) },
    "@/lib/purchase-eligibility-copy": { purchaseEligibilityPolicyHasNoRestriction, purchaseEligibilityUnlockHref, resolvePurchaseEligibilityMessage },
    "@/lib/trust-fields": { trustNumberedRows: () => [] },
    "@/composables/use-published-trust": { usePublishedTrust: () => ({ sections: Vue.ref([]), status: Vue.ref("ready"), refresh: async () => true }) },
  };
  const exports = { default: {} as Vue.Component & { setup: (...args: unknown[]) => Record<string, any> } };
  new Function("require", "exports", code)((id: string) => {
    if (id.endsWith(".vue")) return { default: {} };
    if (!(id in dependencies)) throw new Error(`Unexpected detail import ${id}`);
    return dependencies[id];
  }, exports);
  const scope = Vue.effectScope();
  teardowns.push(() => {
    try {
      expect(unloads).toHaveLength(1);
      unloads.forEach(unload => unload());
      expect(cta.value).toBeNull();
      expect(unmounts).toHaveLength(1);
      unmounts.forEach(unmount => unmount());
      expect(cta.value).toBeNull();
    } finally {
      scope.stop();
    }
  });
  const view = scope.run(() => exports.default.setup({}, { expose() {} }))!;
  async function body() {
    // The separately compiled template uses public setup bindings; do not carry
    // compiler-sfc's non-enumerable __isScriptSetup marker into this SSR wrapper.
    const app = Vue.createSSRApp({ render, setup: () => Vue.proxyRefs({ ...view }) });
    const blank = { setup: () => () => null };
    app.component("AppChassis", { setup: (_: unknown, { slots }: any) => () => Vue.h("main", slots.default?.()) });
    for (const name of ["SectionHeader", "ProductRender", "LiveSocialProof", "SpecTable", "LockedProductCard", "PromotionProduct"]) app.component(name, blank);
    return renderToString(app);
  }
  return { app, catalog, presentation, translations, loads, reads, refresh, eligibility, cta, header, view, body, getProduct };
}

describe("BUG 400 detail header distinguishes pending/failed reads from a missing product", () => {
  it.each(copies)("%s follows actual onLoad, error, Retry and ready without relaxing purchase guards", async (_language, copy) => {
    const p = page(copy);
    const loaded = p.loads[0]({ id: " cloud-share " });
    expect(p.view.id.value).toBe("cloud-share");
    expect(p.header.value).toEqual({ title: copy.store.catalogLoadingTitle, backHref: "/store" });
    expect(await p.body()).toContain(copy.store.catalogLoadingTitle);
    expect(p.view.product.value).toBeUndefined(); expect(p.cta.value).toBeNull();
    p.reads[0](false); await loaded; await Vue.nextTick();
    expect(p.header.value.title).toBe(copy.store.catalogErrorTitle);
    expect(await p.body()).toContain('data-testid="detail-catalog-retry"');
    expect(await p.body()).toContain(copy.store.catalogRetry);
    expect(p.presentation.value.products).toEqual([cloud]);
    expect(p.view.product.value).toBeUndefined(); expect(p.cta.value).toBeNull();
    const retry = p.view.retryCatalog();
    await p.view.retryCatalog(); // A second click must not start another read.
    expect(p.refresh).toHaveBeenCalledTimes(2); expect(p.refresh).toHaveBeenLastCalledWith(true);
    expect(p.view.catalogRetrying.value).toBe(true);
    expect(p.header.value.title).toBe(copy.store.catalogLoadingTitle);
    expect(p.cta.value).toBeNull();
    p.reads[1](true); await retry; await Vue.nextTick();
    expect(p.view.catalogRetrying.value).toBe(false);
    expect(p.header.value.title).toBe("Cloud Share");
    expect(p.header.value.subtitle).toBeUndefined();
    expect(p.view.product.value).toEqual(cloud);
    expect(await p.body()).not.toContain(copy.store.faq.refund.q);
    expect(p.cta.value).toMatchObject({ disabled: true, href: "/pages/store/detail?id=cloud-share" });
    p.eligibility.value = { status: "ready", eligible: true, snapshot: {
      productNo: cloud.id, eligible: true, decisionCode: "ELIGIBLE", evaluatedAt: 1,
      source: PURCHASE_ELIGIBILITY_SOURCE, sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true,
      policies: [{ policy: "E1", eligible: true, decisionCode: "ELIGIBLE", mode: "ALL", conditions: [] },
        { policy: "F4B", eligible: true, decisionCode: "F4B_NOT_CONFIGURED", mode: "ALL", conditions: [] }],
    } }; await Vue.nextTick();
    expect(p.cta.value?.href).toBe(promotionEntry.promotionCheckoutHref([{ productNo: cloud.id, quantity: 1 }]));
    p.catalog.status = "loading"; await Vue.nextTick();
    expect(p.header.value.title).toBe(copy.store.catalogLoadingTitle); expect(p.cta.value).toBeNull();
    p.catalog.status = "error"; await Vue.nextTick();
    expect(p.header.value.title).toBe(copy.store.catalogErrorTitle); expect(p.cta.value).toBeNull();
    expect(p.header.value.subtitle).toBeUndefined();
    expect(p.getProduct).not.toHaveBeenCalled();
    p.catalog.status = "ready"; await Vue.nextTick();
    expect(p.cta.value?.href).toBe(promotionEntry.promotionCheckoutHref([{ productNo: cloud.id, quantity: 1 }]));
  });

  it.each(copies)("%s reports not-found only after a successful directory lacks the target", async (_language, copy) => {
    const p = page(copy); const loaded = p.loads[0]({ id: "cloud-share" });
    expect(p.header.value.title).toBe(copy.store.catalogLoadingTitle);
    p.reads[0](true, []); await loaded; await Vue.nextTick();
    expect(p.header.value.title).toBe(copy.store.coProductNotFound);
    expect(await p.body()).toContain(copy.store.coProductNotFound);
    expect(p.view.product.value).toBeUndefined(); expect(p.cta.value).toBeNull();
    p.presentation.value = { products: [{ ...cloud, name: "Fresh Cloud Share" }] }; await Vue.nextTick();
    expect(p.header.value.title).toBe("Fresh Cloud Share");
  });

  it.each(["", "unknown-product"])("keeps empty/unknown id %j unavailable without borrowing a product", async id => {
    const p = page(); const loaded = p.loads[0]({ id });
    expect(p.header.value.title).toBe(en.store.catalogLoadingTitle);
    p.reads[0](true); await loaded; await Vue.nextTick();
    expect(p.view.product.value).toBeUndefined(); expect(p.cta.value).toBeNull();
    expect(p.header.value.title).toBe(en.store.coProductNotFound);
    expect(p.getProduct).not.toHaveBeenCalled();
  });

  it("uses the ordinary navigation-query id and releases Retry busy state on repeated failure", async () => {
    const p = page(en, "id=cloud-share"); const loaded = p.loads[0]({});
    expect(p.view.id.value).toBe("cloud-share"); p.reads[0](false); await loaded;
    const retry = p.view.retryCatalog(); p.reads[1](false); await retry; await Vue.nextTick();
    expect(p.view.catalogRetrying.value).toBe(false);
    expect(p.header.value.title).toBe(en.store.catalogErrorTitle); expect(p.cta.value).toBeNull();
    p.translations.value = zh; await Vue.nextTick(); expect(p.header.value.title).toBe(zh.store.catalogErrorTitle);
    p.catalog.status = "loading"; p.translations.value = vietnamese; await Vue.nextTick();
    expect(p.header.value.title).toBe(vietnamese.store.catalogLoadingTitle);
  });
});

describe("Cloud Share estimates use the catalog price, annual range and selected quantity", () => {
  it("limits new Share quantities to authoritative remaining slots and offers management when full", async () => {
    const p = page(); const loaded = p.loads[0]({ id: cloud.id });
    p.reads[0](true); await loaded;
    p.eligibility.value = { status: "ready", eligible: true, snapshot: {
      productNo: cloud.id, eligible: true, decisionCode: "ELIGIBLE", evaluatedAt: 1,
      source: PURCHASE_ELIGIBILITY_SOURCE, sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true,
      policies: [{ policy: "E1", eligible: true, decisionCode: "ELIGIBLE", mode: "ALL", conditions: [] },
        { policy: "F4B", eligible: true, decisionCode: "F4B_NOT_CONFIGURED", mode: "ALL", conditions: [] }],
    } };
    p.app.remoteSlotsUsed = 5; await Vue.nextTick();
    p.view.inc(); expect(p.view.qty.value).toBe(1);
    expect(p.cta.value?.quantity).toMatchObject({ min: 1, max: 1, value: 1 });
    p.app.remoteSlotsUsed = 6; await Vue.nextTick();
    expect(p.cta.value?.href).toBe("/pages/me/devices");
    expect(p.cta.value?.quantity).toBeUndefined();
    p.app.remoteSlotsUsed = 4; await Vue.nextTick(); p.view.inc(); await Vue.nextTick();
    expect(p.view.qty.value).toBe(2);
    expect(p.cta.value?.href).toBe(promotionEntry.promotionCheckoutHref([{ productNo: cloud.id, quantity: 2 }]));
  });
  it("keeps sub-cent USDT precision and scales both currencies with quantity", async () => {
    const p = page(zh); const loaded = p.loads[0]({ id: "cloud-share" });
    p.reads[0](true); await loaded; await Vue.nextTick();
    expect(p.view.shareDailyUsdt.value).toEqual({ min: "0.004362", max: "0.006542" });
    expect(p.view.shareDailyUvtText.value).toBe("3.00");
    expect(await p.body()).toContain("直接购买算力份额，更加灵活。");
    p.view.inc(); p.view.inc(); await Vue.nextTick();
    expect(p.view.qty.value).toBe(3);
    expect(p.view.shareDailyUsdt.value).toEqual({ min: "0.013085", max: "0.019627" });
    expect(p.view.shareDailyUvtText.value).toBe("9.00");
    expect(await p.body()).toContain("0.019627");
    p.view.dec(); await Vue.nextTick();
    expect(p.view.shareDailyUsdt.value).toEqual({ min: "0.008723", max: "0.013085" });
    expect(p.view.shareDailyUvtText.value).toBe("6.00");
  });

  it("updates with catalog price/rates and retains a genuine zero UVT allocation", async () => {
    const p = page(); const loaded = p.loads[0]({ id: "cloud-share" });
    p.reads[0](true, [{ ...cloud, price: 39.8, dailyEarnNEX: 0 }]); await loaded;
    expect(p.view.shareDailyUsdt.value).toEqual({ min: "0.008723", max: "0.013085" });
    expect(p.view.shareDailyUvtText.value).toBe("0.00");
    p.presentation.value = { products: [{ ...cloud, shareYieldMin: 10, shareYieldMax: 10 }] };
    await Vue.nextTick();
    expect(p.view.shareDailyUsdt.value).toEqual({ min: "0.005452", max: "0.005452" });
    const body = await p.body();
    expect(body.match(/0\.005452/g)).toHaveLength(1);
  });

  it.each(copies)("%s does not invent a USDT estimate when the annual range is unavailable", async (_language, copy) => {
    const p = page(copy); const loaded = p.loads[0]({ id: "cloud-share" });
    p.reads[0](true, [{ ...cloud, shareYieldMin: undefined, shareYieldMax: undefined }]);
    await loaded; await Vue.nextTick();
    expect(p.view.shareDailyUsdt.value).toBeNull();
    expect(p.view.shareDailyUvtText.value).toBe("3.00");
    expect(await p.body()).toContain(copy.store.specValueUnavailable);
    expect(await p.body()).toContain(copy.store.shareFlexibleDescription);
  });
});
