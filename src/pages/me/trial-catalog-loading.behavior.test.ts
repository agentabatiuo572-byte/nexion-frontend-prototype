import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, test, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import raw from "./trial.vue?raw";
import { formatAmount } from "@/lib/amount-display";
import { trialLifecycleCopy } from "@/i18n/trial-lifecycle";
import { trialPurchaseCopy } from "@/i18n/trial-purchase";

// Render the actual page and invoke its actual handlers: disabling the paint
// must not allow a click/key press to navigate against an unread catalog.
const { descriptor } = parse(raw, { filename: "trial.vue" });
const script = compileScript(descriptor, { id: "trial-catalog-loading", inlineTemplate: true });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type HostNode = { type: string; text: string; parent: HostNode | null; children: HostNode[]; props: Record<string, unknown> };
const node = (type: string, text = ""): HostNode => ({ type, text, parent: null, children: [], props: {} });
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: type => node(type), createText: text => node("text", text), createComment: () => node("comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(entry => entry !== child);
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(entry => entry !== child); },
});
const textContent = (target: HostNode): string => target.text + target.children.map(textContent).join("");
const find = (target: HostNode, predicate: (item: HostNode) => boolean): HostNode | undefined =>
  predicate(target) ? target : target.children.map(child => find(child, predicate)).find(Boolean);
const click = (target: HostNode) => (target.props.onClick as () => void)();
const unmounts: Array<() => void> = [];
const translations = { en, zh, vi: vietnamese };
const stockProduct = () => ({ id: "stellarbox-s1", imageUrl: "/catalog/stellarbox-s1.webp" as string | undefined,
  productType: "DEVICE", inventoryMode: "FINITE", stock: 99995, purchaseBlocked: false });

async function mount(locale: keyof typeof translations, trialStatus: "none" | "active" | "grace" | "ended" | "converted", catalogStatus: string, remoteApiEnabled = false) {
  vi.useFakeTimers();
  const catalog = Vue.reactive({ status: catalogStatus });
  const product = Vue.ref<ReturnType<typeof stockProduct> | undefined>(stockProduct());
  const config = Vue.reactive({ trialProductId: "stellarbox-s1", trialOffsetCapUSD: 10 });
  const trial = Vue.reactive({ status: trialStatus, authorityStatus: "ready", authorityServerState: "ACTIVE",
    authoritativeConversion: undefined as { refunded: boolean; rewardsReversed: boolean; orderNo: string } | undefined,
    startedAt: 1, expiresAt: 2, graceEndsAt: null, canStart: (): boolean => false, eligibility: () => ({ reason: "used" }) });
  const navTo = vi.fn();
  const refresh = vi.fn().mockResolvedValue(true);
  const showClaim = vi.fn();
  const dependencies: Record<string, unknown> = {
    "@/api/runtime": { remoteApiEnabled },
    "@/i18n/trial-lifecycle": { useTrialLifecycleCopy: () => Vue.ref(trialLifecycleCopy[locale]) },
    "@/i18n/trial-purchase": { useTrialPurchaseCopy: () => Vue.ref(trialPurchaseCopy[locale]) },
    "@/lib/amount-display": { formatAmount, formatGroupedAmount: formatAmount },
    vue: Vue,
    "@/components/app-chassis.vue": { default: { setup: (_props: unknown, context: { slots: Vue.Slots }) => () => Vue.h("chassis", context.slots.default?.()) } },
    "@/components/sub-page-header.vue": { default: { render: () => null } },
    "@/components/earn/trial-progress-hero.vue": { default: { render: () => null } },
    "@/components/catalog-machine-image.vue": { default: { props: ["sku", "imageUrl", "scopeKey"],
      setup: (props: Record<string, unknown>) => () => Vue.h("catalog-image", { ...props }) } },
    "@/i18n/use-t": { useT: () => Vue.ref(translations[locale]) },
    "@/i18n/format": { fmt },
    "@/lib/trial-date": { formatTrialDateTime: () => "", formatTrialDeadline: () => "" },
    "@/api/geo-policy-error": { geoPolicyErrorKind: () => null, geoPolicyUserMessage: () => null },
    "@/store/free-trial": { useFreeTrial: () => trial, liveShadowUSD: () => 1, liveShadowNEX: () => 0, remainingMs: () => 1 },
    "@/store/trial-config": { useTrialConfig: () => ({ config }),
      computeTrialOffset: () => ({ offsetUSD: 1, remainderUSD: 0 }), resolveTrialCheckoutProductId: (id: string) => id },
    "@/store/trial-claim-sheet": { useTrialClaimSheet: () => ({ show: showClaim }) },
    "@/mock/products": { getProduct: (id: string) => product.value?.id === id ? product.value : undefined },
    "@/store/product-catalog": { productCatalogState: catalog, refreshProductCatalog: refresh },
    "@/lib/route": { navTo },
    "@/composables/use-dialog-a11y": { useDialogA11y: () => {} },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected page import: ${id}`);
    return dependencies[id];
  }, exports);
  const root = node("root");
  const app = renderer.createApp(exports.default);
  app.mount(root); unmounts.push(() => app.unmount());
  await Vue.nextTick();
  refresh.mockClear();
  return { root, catalog, product, config, trial, navTo, refresh, showClaim,
    image: () => find(root, item => item.type === "catalog-image"),
    buy: () => find(root, item => item.props["aria-disabled"] !== undefined)!,
    retry: () => find(root, item => item.props.role === "button" && textContent(item) === translations[locale].store.catalogRetry),
  };
}
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.useRealTimers(); });

const unreadCases = (["en", "zh", "vi"] as const).flatMap(locale =>
  (["active", "grace", "ended"] as const).flatMap(status =>
    ["loading", "idle", "error"].map(catalog => ({ locale, status, catalog }))));
test.each(unreadCases)("$locale $status with $catalog catalog stays neutral and cannot navigate", async ({ locale, status, catalog }) => {
  const page = await mount(locale, status, catalog);
  const messages = translations[locale];
  const normalLabel = textContent((await mount(locale, status, "ready")).buy());
  const label = catalog === "error" ? messages.store.catalogErrorTitle : normalLabel;
  expect(textContent(page.buy())).toBe(label);
  expect(page.buy().props).toMatchObject({ "aria-label": label, "aria-disabled": "true", tabindex: -1, "aria-busy": catalog === "error" ? "false" : "true" });
  expect(textContent(page.root)).not.toContain(messages.store.temporarilyOutOfStock);
  expect(textContent(page.root)).not.toContain(messages.store.trialProductUnavailable);
  click(page.buy());
  const handlers = page.buy().props.onKeydown;
  for (const handler of Array.isArray(handlers) ? handlers : [handlers]) {
    (handler as (event: unknown) => void)({ key: "Enter", preventDefault: vi.fn() });
  }
  expect(page.navTo).not.toHaveBeenCalled();
  expect(Boolean(page.retry())).toBe(catalog === "error");
  expect(page.trial.status).toBe(status);
});

test.each(["zh", "en", "vi"] as const)("%s ended card binds art and checkout to the same current trial product", async locale => {
  const page = await mount(locale, "ended", "ready");
  expect(page.image()?.props).toMatchObject({ sku: "stellarbox-s1", imageUrl: stockProduct().imageUrl, scopeKey: "trial-ended" });
  expect(textContent(page.root)).toContain(translations[locale].trial.endedTitle);
  expect(textContent(page.root)).toContain(translations[locale].trial.endedDesc);

  page.config.trialProductId = "stellarbox-pro";
  await Vue.nextTick();
  expect(page.image()?.props).toMatchObject({ sku: "stellarbox-pro", imageUrl: undefined });
  click(page.buy());
  expect(page.navTo).not.toHaveBeenCalled();

  page.product.value = { ...stockProduct(), id: "stellarbox-pro", imageUrl: "/catalog/pro-current.webp" };
  await Vue.nextTick();
  expect(page.image()?.props).toMatchObject({ sku: "stellarbox-pro", imageUrl: "/catalog/pro-current.webp" });
  click(page.buy());
  expect(page.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/checkout?product=stellarbox-pro&source=trial");
});

test.each(["loading", "idle", "error"])("ended art does not retain an unconfirmed image while catalog is %s", async status => {
  const page = await mount("zh", "ended", "ready");
  expect(page.image()?.props.imageUrl).toBe(stockProduct().imageUrl);
  page.catalog.status = status;
  await Vue.nextTick();
  expect(page.image()?.props.imageUrl).toBeUndefined();
  expect(page.buy().props["aria-disabled"]).toBe("true");
  expect(textContent(page.root)).toContain(zh.trial.endedDesc);
});

test("missing catalog art stays neutral without disabling a saleable product", async () => {
  const page = await mount("zh", "ended", "ready");
  page.product.value!.imageUrl = undefined;
  await Vue.nextTick();
  expect(page.image()?.props).toMatchObject({ sku: "stellarbox-s1", imageUrl: undefined });
  expect(page.buy().props["aria-disabled"]).toBe("false");
  click(page.buy());
  expect(page.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/checkout?product=stellarbox-s1&source=trial");
});

test.each(["zh", "en", "vi"] as const)("%s refunded trial can re-enter the existing claim branch before ended art", async locale => {
  const page = await mount(locale, "ended", "ready", true);
  page.trial.authoritativeConversion = { refunded: true, rewardsReversed: true, orderNo: "REFUND-031" };
  page.trial.canStart = () => true;
  await Vue.nextTick();
  expect(page.image()).toBeUndefined();
  expect(find(page.root, item => item.props["data-testid"] === "trial-ended")).toBeUndefined();
  const claim = find(page.root, item => item.props.role === "button" && textContent(item) === translations[locale].trial.idleCta)!;
  click(claim);
  expect(page.showClaim).toHaveBeenCalledOnce();
  expect(page.navTo).not.toHaveBeenCalled();
});

test.each(["none", "active", "grace", "converted"] as const)("%s keeps its existing state without ended-only art", async status => {
  const page = await mount("zh", status, "ready");
  expect(page.image()).toBeUndefined();
});

test("converted refund information and order entry remain readable without ended art", async () => {
  const page = await mount("zh", "converted", "ready", true);
  page.trial.authoritativeConversion = { refunded: true, rewardsReversed: true, orderNo: "REFUND-031" };
  await Vue.nextTick();
  expect(page.image()).toBeUndefined();
  expect(textContent(page.root)).toContain(trialPurchaseCopy.zh.refundedBody);
  expect(textContent(page.root)).toContain(trialPurchaseCopy.zh.refundedRewards);
  const order = find(page.root, item => item.props.role === "button" && textContent(item) === trialPurchaseCopy.zh.refundOrderCta)!;
  click(order);
  expect(page.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/order-detail?id=REFUND-031");
});

test.each(["active", "grace", "ended"] as const)("ready %s catalog enables only the canonical saleable product", async status => {
  const page = await mount("zh", status, "ready");
  expect(page.buy().props["aria-disabled"]).toBe("false");
  click(page.buy());
  expect(page.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/checkout?product=stellarbox-s1&source=trial");
  for (const product of [{ ...stockProduct(), stock: 0 }, { ...stockProduct(), purchaseBlocked: true }, undefined]) {
    page.product.value = product;
    await Vue.nextTick();
    expect(textContent(page.buy())).toBe(zh.store.temporarilyOutOfStock);
    expect(page.buy().props).toMatchObject({ "aria-label": zh.store.temporarilyOutOfStock, "aria-disabled": "true", tabindex: -1 });
    expect(textContent(page.root)).toContain(zh.store.trialProductUnavailable);
    click(page.buy());
    expect(page.navTo).toHaveBeenCalledTimes(1);
  }
});

test.each(["active", "grace", "ended"] as const)("%s can independently retry a failed catalog and recover without changing the trial", async status => {
  const page = await mount("zh", status, "error");
  let finish!: (ok: boolean) => void;
  page.refresh.mockImplementationOnce(() => {
    page.catalog.status = "loading";
    return new Promise<boolean>(resolve => { finish = resolve; });
  });
  const retry = page.retry()!;
  click(retry); click(retry);
  await Vue.nextTick();
  expect(page.refresh).toHaveBeenCalledExactlyOnceWith(true);
  expect(page.retry()).toBeUndefined();
  expect(textContent(page.buy())).not.toBe(zh.store.catalogLoadingTitle);
  click(page.buy()); expect(page.navTo).not.toHaveBeenCalled();
  page.catalog.status = "ready"; finish(true);
  await Vue.nextTick();
  expect(page.buy().props["aria-disabled"]).toBe("false");
  expect(textContent(page.root)).not.toContain(zh.store.temporarilyOutOfStock);
  expect(page.trial.status).toBe(status);
  click(page.buy());
  expect(page.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/checkout?product=stellarbox-s1&source=trial");
});
