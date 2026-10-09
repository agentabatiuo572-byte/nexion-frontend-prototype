import * as Vue from "vue";
import type { Component } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import cardRaw from "../../components/store/product-card.vue?raw";
import detailRaw from "./detail.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { fmt } from "@/i18n/format";
import { nexGridBrandText } from "@/lib/brand-copy";
import { catalogProductImageUrl, productTierCode } from "@/lib/product-image";
import { localizedDatacenterValue, productCopy, specRow, specText } from "@/lib/product-copy";
import { isProductAvailable } from "@/store/product-availability";
import { parseProductCatalogPayload } from "@/api/product-catalog-contract";
import { purchaseEligibilityPolicyHasNoRestriction, purchaseEligibilityUnlockHref, resolvePurchaseEligibilityMessage } from "@/lib/purchase-eligibility-copy";
import type { PurchaseEligibilityRequestStatus } from "@/lib/purchase-eligibility-copy";
import { PURCHASE_ELIGIBILITY_SOURCE, type PurchaseEligibilitySnapshot } from "@/api/purchase-eligibility-api";
import type { Product } from "@/mock/products";

vi.mock("@/store/locale", () => ({ useLocaleStore: () => ({ code: "zh" }) }));
vi.mock("@/i18n/use-t", async () => ({ DICTS: { zh: (await import("@/i18n/messages/zh")).zh } }));
vi.mock("@/store/product-phase", () => ({ isPhaseReached: () => { throw new Error("Server fixture must not use local phase"); } }));

// Compile both production scripts AND templates; only external stores, lifecycle,
// child presentation and navigation are adapters. No copy of the inventory guard.
function compile(raw: string, filename: string): string {
  const { descriptor } = parse(raw, { filename });
  return ts.transpileModule(compileScript(descriptor, { id: filename, inlineTemplate: true }).content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const cardCode = compile(cardRaw, "product-card.vue");
const detailCode = compile(detailRaw, "detail.vue");
type Host = { type: string; text: string; parent: Host | null; children: Host[]; props: Record<string, unknown> };
const node = (type: string, text = ""): Host => ({ type, text, parent: null, children: [], props: {} });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: type => node(type), createText: text => node("text", text), createComment: () => node("comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = parent;
    const at = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(at < 0 ? parent.children.length : at, 0, child);
  },
  remove: child => {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = null;
  },
});
const textContent = (host: Host): string => host.text + host.children.map(textContent).join("");
function find(host: Host, predicate: (entry: Host) => boolean): Host | undefined {
  return predicate(host) ? host : host.children.map(child => find(child, predicate)).find(Boolean);
}
const unmounts: Array<() => void> = [];
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); });

function canonicalProduct(type: "SHARE" | "DEVICE", inventoryMode: "FINITE" | "UNLIMITED", stock: number | null): Product {
  const raw = {
    source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "fixture",
    products: [{ id: "finite-share-fixture", name: "Finite share fixture", tier: "Entry", tagline: "published",
      productType: type, inventoryMode, features: [], price: 20, dailyEarn: 0.3, dailyEarnNEX: 1,
      sold: 0, stock, status: "active", available: true,
      purchaseBlocked: inventoryMode === "FINITE" && stock === 0,
      purchaseBlockedReason: inventoryMode === "FINITE" && stock === 0 ? "PRODUCT_OUT_OF_STOCK" : undefined }],
  };
  return parseProductCatalogPayload(raw).products[0];
}

async function mountPair(product: Product) {
  const current = Vue.reactive(product);
  const openSnapshot: PurchaseEligibilitySnapshot = {
    productNo: current.id, eligible: true, decisionCode: "ELIGIBLE", evaluatedAt: 1,
    source: PURCHASE_ELIGIBILITY_SOURCE, sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true,
    policies: [{ policy: "E1", eligible: true, decisionCode: "ELIGIBLE", mode: "ALL", conditions: [] }],
  };
  const eligibility = Vue.ref<{ status: PurchaseEligibilityRequestStatus; eligible: boolean; snapshot: PurchaseEligibilitySnapshot | null }>({ status: "ready", eligible: true, snapshot: openSnapshot });
  const catalogState = Vue.reactive({ status: "ready" });
  const presentation = Vue.ref({ products: [current] });
  const navTo = vi.fn();
  const forbiddenNetwork = vi.fn(() => { throw new Error("No business transport in component fixture"); });
  const onLoads: Array<(options: Record<string, string>) => Promise<void>> = [];
  const cta = Vue.ref<Record<string, unknown> | null>(null);
  const empty = { render: () => null };
  const chassis = { setup: (_props: unknown, { slots }: { slots: Record<string, () => Vue.VNode[]> }) => () => Vue.h("chassis-fixture", slots.default?.()) };
  const modules: Record<string, unknown> = {
    vue: Vue,
    "@/i18n/use-t": { useT: () => Vue.ref(zh) }, "@/store/locale": { useLocaleStore: () => ({ code: "zh" }) },
    "@/i18n/format": { fmt }, "@/lib/brand-copy": { nexGridBrandText },
    "@/lib/product-copy": { localizedDatacenterValue, productCopy, specRow, specText },
    "@/lib/product-image": { catalogProductImageUrl, productTierCode },
    "@/lib/route": { navTo, takeNavigationQuery: () => "" },
    "@/api/runtime": { remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: 7101 } }) },
      dayOnePageObservationApi: { s1Roi: forbiddenNetwork }, h3ObservationApi: { productInterest: forbiddenNetwork } },
    "@/store/product-catalog": { productCatalogState: catalogState, productCatalogPresentation: presentation, refreshProductCatalog: async () => true },
    "@/store/purchase-eligibility": { useRemotePurchaseEligibility: () => ({ eligibility, retry: vi.fn() }) },
    "@/composables/use-device-eligibility": { useDeviceEligibility: () => ({ tradeInSources: Vue.ref([]) }) },
    "@/mock/tradein-config": { computeTradeInCredit: () => 0 },
    "@/composables/use-purchase-gate": { usePurchaseGate: () => { throw new Error("Remote fixture must not use local gate"); } },
    "@/lib/promotion-entry": { canPreviewPromotion: () => false, promotionCheckoutHref: () => "", promotionDetailHref: () => "", promotionBundleHref: () => "" },
    "@/lib/promotion-display": { localized: (value: unknown) => value ?? "" },
    "@/composables/use-promotion-context": { usePromotionContext: () => ({ activity: Vue.ref(null), status: Vue.ref("ready"), available: Vue.ref(false), refresh: async () => true }) },
    "@dcloudio/uni-app": { onLoad: (callback: (options: Record<string, string>) => Promise<void>) => onLoads.push(callback), onShow: () => {}, onHide: () => {} },
    "@/mock/products": { getProduct: () => undefined },
    "@/composables/use-product-phase": { useProductPhase: () => Vue.ref({}) },
    "@/store/product-availability": { isProductAvailable },
    "@/composables/use-page-header": { useSetPageHeader: () => {} },
    "@/store/sticky-cta-bar": { useStickyCTA: () => ({ activate: () => {}, show: (value: Record<string, unknown>) => { cta.value = value; }, hide: () => { cta.value = null; } }) },
    "@/lib/product-payback": { estimatePaybackDays: () => null },
    "@/mock/phone-tiers": { getPhoneTierYields: () => [] },
    "@/lib/store-upgrade": { activePhoneDailyRate: () => 0, storeYieldMultiplier: () => 0 },
    "@/store/app": { useApp: () => Vue.reactive({ accountKey: "user:7101", accountBindingEpoch: 0, remoteFleetHasSnapshot: false }) },
    "@/store/server-product-phase": { refreshServerProductPhase: async () => true },
    "@/store/ui": { toast: { error: vi.fn() } },
    "@/lib/account-scope": { captureAccountScope: () => ({}), isCurrentAccountScope: () => true },
    "@/lib/authenticated-page-observation": { authenticatedPageObservationReporter: { report: async () => false } },
    "@/lib/purchase-eligibility-copy": { resolvePurchaseEligibilityMessage, purchaseEligibilityUnlockHref, purchaseEligibilityPolicyHasNoRestriction },
    "@/lib/trust-fields": { trustNumberedRows: () => [] },
    "@/composables/use-published-trust": { recordPublishedTrustViews: () => {}, usePublishedTrust: () => ({ sections: Vue.ref([]), status: Vue.ref("ready"), refresh: async () => true }) },
  };
  function component(code: string): Component {
    const exports = { default: {} as Component };
    new Function("require", "exports", code)((id: string) => {
      if (id in modules) return modules[id];
      if (id === "@/components/app-chassis.vue") return { default: chassis };
      if (id.startsWith("@/components/") && id.endsWith(".vue")) return { default: empty };
      throw new Error("Unexpected production import: " + id);
    }, exports);
    return exports.default;
  }
  const cardRoot = node("card-root"), detailRoot = node("detail-root");
  const cardApp = renderer.createApp(component(cardCode), { product: current });
  cardApp.mount(cardRoot); unmounts.push(() => cardApp.unmount());
  const detailApp = renderer.createApp(component(detailCode));
  detailApp.mount(detailRoot); unmounts.push(() => detailApp.unmount());
  await onLoads[0]({ id: current.id });
  await Vue.nextTick();
  return {
    current, eligibility, catalogState, cta, navTo, forbiddenNetwork, cardRoot, detailRoot,
    buy: () => find(cardRoot, entry => entry.props.role === "button" && "aria-disabled" in entry.props)!,
  };
}
function activate(host: Host, key?: string) {
  const handler = host.props[key ? "onKeydown" : "onClick"] as ((event: unknown) => void) | Array<(event: unknown) => void>;
  const event = { key, stopPropagation() {}, preventDefault() {} };
  (Array.isArray(handler) ? handler : [handler]).forEach(callback => callback(event));
}

test.each(["SHARE", "DEVICE"] as const)("finite %s stock0 renders sold-out and blocks card click/keyboard and detail CTA", async type => {
  const h = await mountPair(canonicalProduct(type, "FINITE", 0));
  expect(h.buy().props["aria-disabled"]).toBe("true");
  expect(h.buy().props.tabindex).toBe(-1);
  expect(textContent(h.buy())).toContain(zh.store.temporarilyOutOfStock);
  expect(textContent(h.detailRoot)).toContain(zh.store.temporarilyOutOfStock);
  expect(h.cta.value).toMatchObject({ buttonLabel: zh.store.temporarilyOutOfStock, amountSubtext: zh.store.temporarilyOutOfStock, disabled: true });
  expect(h.cta.value?.href).not.toContain("/checkout");
  activate(h.buy()); activate(h.buy(), "Enter"); activate(h.buy(), " ");
  expect(h.navTo).not.toHaveBeenCalled();
  expect(h.forbiddenNetwork).not.toHaveBeenCalled();
});

test.each([
  ["SHARE", "FINITE", 1],
  ["SHARE", "UNLIMITED", null],
] as const)("%s %s stock=%s retains the eligible entry", async (type, mode, stock) => {
  const h = await mountPair(canonicalProduct(type, mode, stock));
  expect(h.buy().props["aria-disabled"]).toBe("false");
  expect(textContent(h.buy())).toBe(zh.store.cardBuyNow);
  expect(textContent(h.detailRoot)).not.toContain(zh.store.temporarilyOutOfStock);
  expect(h.cta.value?.disabled).not.toBe(true);
  expect(h.cta.value?.href).toContain("/checkout");
  activate(h.buy());
  expect(h.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/checkout?product=finite-share-fixture");
  expect(h.forbiddenNetwork).not.toHaveBeenCalled();
});

test("finite share detail independently renders inventory warning and disabled sticky configuration", async () => {
  const h = await mountPair(canonicalProduct("SHARE", "FINITE", 0));
  expect(textContent(h.detailRoot)).toContain(zh.store.temporarilyOutOfStock);
  expect(h.cta.value).toMatchObject({ disabled: true, buttonLabel: zh.store.temporarilyOutOfStock });
  expect(h.cta.value?.href).not.toContain("/checkout");
  expect(h.forbiddenNetwork).not.toHaveBeenCalled();
});

test("unlimited share with a retained stock0 field is not mislabeled sold-out", async () => {
  const h = await mountPair({ ...canonicalProduct("SHARE", "UNLIMITED", null), stock: 0 });
  expect(textContent(h.buy())).toBe(zh.store.cardBuyNow);
  expect(textContent(h.detailRoot)).not.toContain(zh.store.temporarilyOutOfStock);
  expect(h.cta.value?.disabled).not.toBe(true);
  expect(h.forbiddenNetwork).not.toHaveBeenCalled();
});

// Incomplete legacy presentation is not canonical evidence of zero inventory.
// Canonical parser rejects FINITE missing stock; the view still must not invent it.
test.each([
  ["SHARE", null], ["SHARE", undefined], ["DEVICE", null], ["DEVICE", undefined],
] as const)("unknown finite %s stock=%s is not mislabeled sold-out", async (type, stock) => {
  const product = { ...canonicalProduct(type, "FINITE", 1), stock } as Product;
  const h = await mountPair(product);
  expect(textContent(h.buy())).not.toContain(zh.store.temporarilyOutOfStock);
  expect(textContent(h.detailRoot)).not.toContain(zh.store.temporarilyOutOfStock);
  expect(h.cta.value?.disabled).not.toBe(true);
  expect(h.forbiddenNetwork).not.toHaveBeenCalled();
});

test("mounted finite share follows 1→0→1 inventory and still fail-closes eligibility/catalog errors", async () => {
  const h = await mountPair(canonicalProduct("SHARE", "FINITE", 1));
  h.current.stock = 0; await Vue.nextTick();
  expect(h.buy().props["aria-disabled"]).toBe("true");
  expect(h.cta.value?.disabled).toBe(true);
  h.current.stock = 1; await Vue.nextTick();
  expect(h.buy().props["aria-disabled"]).toBe("false");
  expect(h.cta.value?.disabled).not.toBe(true);
  h.eligibility.value = { status: "error", eligible: false, snapshot: null }; await Vue.nextTick();
  expect(textContent(h.buy())).toBe(zh.store.purchaseEligibilityRetry);
  expect(h.cta.value).toBeNull();
  activate(h.buy()); expect(h.navTo).not.toHaveBeenCalled();
  h.catalogState.status = "loading"; await Vue.nextTick();
  expect(h.buy().props["aria-disabled"]).toBe("true");
  expect(h.cta.value).toBeNull();
  expect(h.forbiddenNetwork).not.toHaveBeenCalled();
});

test.each(["PURCHASE_GATE_SOLD_OUT", "F4B_MONTHLY_QUOTA_EXHAUSTED"])("retains %s quota denial, with physical stock0 taking its existing precedence", async decisionCode => {
  const h = await mountPair(canonicalProduct("SHARE", "FINITE", 1));
  h.eligibility.value = { status: "ready", eligible: false, snapshot: { ...h.eligibility.value.snapshot!, eligible: false, decisionCode } };
  await Vue.nextTick();
  expect(textContent(h.buy())).not.toBe(zh.store.cardBuyNow);
  expect(h.cta.value).toMatchObject({ disabled: true, buttonLabel: zh.store.purchaseEligibilityQuotaDepleted });
  activate(h.buy());
  expect(h.navTo.mock.calls.every(([href]) => !href.includes("/checkout"))).toBe(true);
  h.current.stock = 0; await Vue.nextTick();
  expect(textContent(h.buy())).toContain(zh.store.temporarilyOutOfStock);
  expect(h.cta.value).toMatchObject({ disabled: true, buttonLabel: zh.store.temporarilyOutOfStock });
  expect(h.forbiddenNetwork).not.toHaveBeenCalled();
});

test("release-closed detail remains hidden ahead of a physical stock0 hint", async () => {
  const h = await mountPair({ ...canonicalProduct("SHARE", "FINITE", 0), available: false });
  expect(textContent(h.detailRoot)).not.toContain(zh.store.temporarilyOutOfStock);
  expect(h.cta.value).toBeNull();
  expect(h.forbiddenNetwork).not.toHaveBeenCalled();
});
