import { afterEach, describe, expect, it, vi } from "vitest";
import { ref, computed, reactive, shallowRef, watch, nextTick, createRenderer, defineComponent, getCurrentInstance, h, KeepAlive, onActivated, onDeactivated, onUnmounted, type ComponentInternalInstance, type Ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useStickyCTA } from "@/store/sticky-cta-bar";
import { promotionCheckoutHref } from "@/lib/promotion-entry";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import ts from "typescript";
import page from "./detail.vue?raw";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(reason: unknown): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const start = page.indexOf('const id = ref("");');
const catalogStatusStart = page.indexOf("const catalogStatus = computed", start);
const catalogStatusEnd = page.indexOf("\n", catalogStatusStart);
if (start < 0 || catalogStatusStart < start || catalogStatusEnd < catalogStatusStart) throw new Error("store detail read lifecycle source is required");
const lifecycleCode = ts.transpileModule(
  `${page.slice(start, catalogStatusEnd)}; return { id, catalogRetrying, refreshDetailFacts, invalidateDetailFacts, retryCatalog, catalogStatus };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function setup() {
  const shown: Array<() => void> = [];
  const loaded: Array<(options?: Record<string, string>) => Promise<void>> = [];
  const catalog = vi.fn<() => Promise<boolean>>();
  const phase = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const trust = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const observe = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const productCatalogState = { status: "loading" };
  const app = reactive({ accountKey: "default", accountBindingEpoch: 1 });
  let currentAccountScope = { accountKey: "user:1", epoch: 1 };
  const value = new Function(
    "ref", "computed", "watch", "app", "Promise", "refreshProductCatalog", "refreshServerProductPhase", "remoteApiEnabled", "refreshTrust", "onLoad", "onShow", "captureAccountScope", "isCurrentAccountScope", "productCatalogState", "observeCanonicalProductDetail", "takeNavigationQuery", "sessionVault", "usePromotionContext",
    lifecycleCode,
  )(ref, computed, watch, app, Promise, catalog, phase, true, trust,
    (callback: (options?: Record<string, string>) => Promise<void>) => loaded.push(callback),
    (callback: () => void) => shown.push(callback),
    () => currentAccountScope,
    (scope: typeof currentAccountScope) => scope === currentAccountScope,
    productCatalogState, observe, () => "?id=stellarbox-pro",
    { read: () => ({ user: { userId: 1 } }) },
    () => ({ activity: ref(null), status: ref("idle"), available: ref(false), refresh: vi.fn() }),
  ) as {
    id: { value: string };
    catalogRetrying: { value: boolean };
    refreshDetailFacts: () => Promise<void>;
    invalidateDetailFacts: () => void;
    retryCatalog: () => Promise<void>;
    catalogStatus: { value: string };
  };
  return {
    shown, loaded, catalog, phase, trust, observe, value, app,
    rebindAccount: () => {
      app.accountKey = "user:2";
      app.accountBindingEpoch += 1;
      currentAccountScope = { accountKey: "user:2", epoch: app.accountBindingEpoch };
    },
  };
}

describe("store detail canonical read lifecycle", () => {
  it("recomputes the product when the cold-start server catalog arrives", () => {
    const productStart = page.indexOf("const product = computed<Product | undefined>");
    const productEnd = page.indexOf(";", productStart) + 1;
    expect(productStart).toBeGreaterThan(0);
    expect(productEnd).toBeGreaterThan(productStart);
    const productCode = ts.transpileModule(
      `${page.slice(productStart, productEnd)}; return product;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
    ).outputText;
    const id = ref("stellarbox-pro");
    const publicOnly = ref(false);
    const catalogStatus = ref<"loading" | "ready" | "error">("loading");
    const presentation = shallowRef<{ products: Array<{ id: string; name: string }> } | null>(null);
    const legacyProducts: Array<{ id: string; name: string }> = [];
    const product = new Function("computed", "id", "catalogStatus", "remoteApiEnabled", "productCatalogPresentation", "getProduct", "publicOnly", productCode)(
      computed, id, catalogStatus, true, presentation, (key: string) => legacyProducts.find((entry) => entry.id === key),
      publicOnly,
    ) as { value?: { id: string; name: string } };
    expect(product.value).toBeUndefined();
    presentation.value = { products: [{ id: "stellarbox-pro", name: "StellarBox Pro" }] };
    catalogStatus.value = "ready";
    expect(product.value?.name).toBe("StellarBox Pro");
    publicOnly.value = true;
    expect(product.value).toBeUndefined();
    publicOnly.value = false;
    catalogStatus.value = "error";
    expect(product.value).toBeUndefined();
  });

  it("hides the purchase CTA while a forced catalog refresh is loading or failed", async () => {
    const stickyStart = page.indexOf("function publishStickyCTA()");
    const stickyEnd = page.indexOf("function showDetailStickyCTA()", stickyStart);
    expect(stickyStart).toBeGreaterThan(0);
    const ctaCode = ts.transpileModule(page.slice(stickyStart, stickyEnd), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const catalogStatus = ref<"ready" | "loading" | "error">("ready");
    // The presentation can retain a prior ready snapshot after a failed forced
    // refresh. Its old product must never keep the purchase entry visible.
    const product = ref({ id: "stellarbox-pro" });
    const sticky = { show: vi.fn(), hide: vi.fn() };
    new Function(
      "watch", "stickyPageVisible", "catalogStatus", "product", "isShare", "isLocked",
      "purchaseUnavailable", "stockUnavailable", "priceText", "dailyEarnText", "paybackLabel",
      "purchaseGate", "eligibility", "purchaseEligibilityMessage", "sticky", "stickyOwner",
      "remoteApiEnabled", "t", "paybackDays", "fmt", "purchaseEligibilityUnlockHref",
      "activityId", "promotionStatus", "promotionAvailable", "activity", "qty",
      ctaCode,
    )(
      watch, ref(true), catalogStatus, product, ref(false), ref(false), ref(false), ref(false),
      ref("1199"), ref("13"), ref("93"), ref({ blocked: false }), ref({ status: "ready", eligible: true }),
      ref(""), sticky, Symbol("detail"), true, ref({ store: { cardBuyNow: "Buy", detPaybackUnavailableNote: "Unavailable" } }),
      ref(null), vi.fn(), vi.fn(),
      ref(""), ref("idle"), ref(false), ref(null), ref(1),
    );
    expect(sticky.show).toHaveBeenCalledOnce();
    catalogStatus.value = "loading";
    await nextTick();
    expect(sticky.hide).toHaveBeenCalledOnce();
    catalogStatus.value = "error";
    await nextTick();
    expect(sticky.hide).toHaveBeenCalledTimes(2);
    catalogStatus.value = "ready";
    await nextTick();
    expect(sticky.show).toHaveBeenCalledTimes(2);
  });

  it("retries the direct detail read after cold session restore binds the account", async () => {
    const s = setup();
    s.catalog.mockResolvedValue(false);
    await s.loaded[0]({ id: "stellarbox-pro" });
    s.shown[0]();
    await Promise.resolve();
    expect(s.catalog).toHaveBeenCalledTimes(2);
    s.rebindAccount();
    await nextTick();
    expect(s.catalog).toHaveBeenCalledTimes(3);
    expect(s.value.id.value).toBe("stellarbox-pro");

    s.app.accountBindingEpoch += 1;
    await nextTick();
    expect(s.catalog).toHaveBeenCalledTimes(4);
  });

  it("retains the SKU when a cold H5 onLoad omits its hash query", async () => {
    const s = setup();
    s.catalog.mockResolvedValue(true);
    await s.loaded[0]();
    expect(s.value.id.value).toBe("stellarbox-pro");
    expect(s.catalog).toHaveBeenCalledOnce();
  });

  it("starts the public Trust read only after the forced catalog revision settles, including a catalog failure", async () => {
    const catalogRead = deferred<boolean>();
    const s = setup();
    s.catalog.mockReturnValueOnce(catalogRead.promise);

    const reading = s.value.refreshDetailFacts();
    expect(s.catalog).toHaveBeenCalledTimes(1);
    // A forced catalog read advances the runtime revision on either settlement.
    // Starting Trust before that boundary makes its valid response stale.
    expect(s.trust).not.toHaveBeenCalled();
    expect(s.observe).not.toHaveBeenCalled();

    catalogRead.resolve(false);
    await reading;
    expect(s.phase).toHaveBeenCalledTimes(1);
    expect(s.trust).toHaveBeenCalledTimes(1);
    expect(s.observe).toHaveBeenCalledTimes(1);
  });

  it("does not restart public Trust after the detail read was invalidated by hide or account rebind", async () => {
    const hiddenCatalog = deferred<boolean>();
    const hidden = setup();
    hidden.catalog.mockReturnValueOnce(hiddenCatalog.promise);
    const hiddenRead = hidden.value.refreshDetailFacts();
    hidden.value.invalidateDetailFacts();
    hiddenCatalog.resolve(true);
    await hiddenRead;
    expect(hidden.phase).not.toHaveBeenCalled();
    expect(hidden.trust).not.toHaveBeenCalled();
    expect(hidden.observe).not.toHaveBeenCalled();

    const staleAccountCatalog = deferred<boolean>();
    const account = setup();
    account.catalog.mockReturnValueOnce(staleAccountCatalog.promise);
    const accountRead = account.value.refreshDetailFacts();
    account.rebindAccount();
    staleAccountCatalog.resolve(true);
    await accountRead;
    expect(account.phase).not.toHaveBeenCalled();
    expect(account.trust).not.toHaveBeenCalled();
    expect(account.observe).not.toHaveBeenCalled();
  });

  it("calls the observer only after both public projections settle", async () => {
    const s = setup();
    const phase = deferred<boolean>();
    const trust = deferred<boolean>();
    s.catalog.mockResolvedValue(true);
    s.phase.mockReturnValue(phase.promise);
    s.trust.mockReturnValue(trust.promise);
    const reading = s.value.refreshDetailFacts();
    await Promise.resolve();
    expect(s.trust).toHaveBeenCalledTimes(1);
    expect(s.observe).not.toHaveBeenCalled();
    phase.resolve(true);
    await Promise.resolve();
    expect(s.observe).not.toHaveBeenCalled();
    trust.resolve(true);
    await reading;
    expect(s.observe).toHaveBeenCalledTimes(1);
  });

  for (const boundary of ["hide", "account rebind"] as const) {
    it(`does not observe when ${boundary} occurs during the public projection read`, async () => {
      const s = setup();
      const trust = deferred<boolean>();
      s.catalog.mockResolvedValue(true);
      s.trust.mockReturnValue(trust.promise);
      const reading = s.value.refreshDetailFacts();
      await Promise.resolve();
      expect(s.trust).toHaveBeenCalledTimes(1);
      if (boundary === "hide") s.value.invalidateDetailFacts();
      else s.rebindAccount();
      trust.resolve(true);
      await reading;
      expect(s.observe).not.toHaveBeenCalled();
    });
  }

  it("starts a new lifecycle read from onShow without letting the earlier read trigger Trust", async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const s = setup();
    s.catalog.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const loading = s.loaded[0]({ id: "no-such-product" });
    expect(s.value.id.value).toBe("no-such-product");
    expect(s.catalog).toHaveBeenCalledTimes(1);
    s.shown[0]();
    expect(s.catalog).toHaveBeenCalledTimes(2);

    first.resolve(false);
    await loading;
    second.resolve(true);
    await Promise.resolve();
    expect(s.trust).toHaveBeenCalledTimes(1);
  });

  it("serializes an error retry and does not leave its busy flag set after recovery", async () => {
    const failed = deferred<boolean>();
    const recovered = deferred<boolean>();
    const s = setup();
    s.catalog.mockReturnValueOnce(failed.promise).mockReturnValueOnce(recovered.promise);

    const firstRetry = s.value.retryCatalog();
    const duplicateRetry = s.value.retryCatalog();
    expect(s.catalog).toHaveBeenCalledTimes(1);
    expect(s.value.catalogRetrying.value).toBe(true);
    failed.resolve(false);
    await Promise.all([firstRetry, duplicateRetry]);
    expect(s.value.catalogRetrying.value).toBe(false);

    const recoveryRetry = s.value.retryCatalog();
    expect(s.catalog).toHaveBeenCalledTimes(2);
    recovered.resolve(true);
    await recoveryRetry;
    expect(s.value.catalogRetrying.value).toBe(false);
    expect(s.phase).toHaveBeenCalledTimes(2);
  });

  it("restores Trust after a successful catalog retry invalidates its prior public snapshot", async () => {
    const s = setup();
    let trustStatus: "ready" | "idle" = "ready";
    s.catalog.mockImplementationOnce(async () => {
      // Mirrors refreshProductCatalog(true): current settlement advances the
      // runtime revision and the Trust listener clears its snapshot to idle.
      trustStatus = "idle";
      return true;
    });
    s.trust.mockImplementationOnce(async () => {
      expect(trustStatus).toBe("idle");
      trustStatus = "ready";
      return true;
    });

    await s.value.retryCatalog();
    expect(s.catalog).toHaveBeenCalledTimes(1);
    expect(s.trust).toHaveBeenCalledTimes(1);
    expect(trustStatus).toBe("ready");
    expect(s.value.catalogRetrying.value).toBe(false);
  });
});

type Host = { parent: Host | null; children: Host[] };
const host = (): Host => ({ parent: null, children: [] });
const renderer = createRenderer<Host, Host>({
  createElement: host, createText: host, createComment: host,
  setText: () => {}, setElementText: () => {}, patchProp: () => {},
  parentNode: node => node.parent,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  insert: (node, parent, anchor) => {
    if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node);
    node.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(node); else parent.children.splice(index, 0, node);
  },
  remove: node => {
    if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node);
    node.parent = null;
  },
});
const closes: Array<() => void> = [];
afterEach(() => { closes.splice(0).forEach(close => close()); });

const stickyStart = page.indexOf("const sticky = useStickyCTA();");
const stickyEnd = page.indexOf("// ─── styles", stickyStart);
if (stickyStart < 0 || stickyEnd < stickyStart) throw new Error("store detail sticky lifecycle source is required");
const runSticky = new Function("dependencies", ts.transpileModule(`
  const { ref, watch, useStickyCTA, catalogStatus, product, isShare, isLocked,
    purchaseUnavailable, stockUnavailable, priceText, dailyEarnText, paybackLabel,
    purchaseGate, eligibility, purchaseEligibilityMessage, remoteApiEnabled, t,
    purchaseEligibilityUnlockHref, activityId, promotionStatus, promotionAvailable,
    activity, qty, promotionCheckoutHref, onShow, onHide, onUnload, onActivated,
    onDeactivated, onUnmounted, invalidateDetailFacts } = dependencies;
  let detailPageVisible = true;
  let detailObservationEpoch = 0;
  ${page.slice(stickyStart, stickyEnd)}
  return { stickyPageVisible, stickyOwner, visible: () => detailPageVisible,
    observationEpoch: () => detailObservationEpoch };
`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText);

type PageHook = "onShow" | "onHide" | "onUnload";
type StickyPage = {
  instance: ComponentInternalInstance;
  hooks: Record<PageHook, Array<() => void>>;
  invalidate: ReturnType<typeof vi.fn>;
  qty: Ref<number>;
  activityId: Ref<string>;
  controls: { stickyPageVisible: Ref<boolean>; stickyOwner: symbol; visible(): boolean; observationEpoch(): number };
};

async function stickyNavigation() {
  setActivePinia(createPinia());
  const sticky = useStickyCTA();
  const translations = ref(en);
  const catalogStatus = ref("ready");
  const catalog = ref({ id: "stellarbox-pro", price: 1199, dailyEarn: 13 });
  const instances = new Map<string, StickyPage>();
  const pages = new Map(["detail", "again"].map(key => [key, defineComponent({
    name: `StickyDetail_${key}`,
    setup() {
      const hooks: StickyPage["hooks"] = { onShow: [], onHide: [], onUnload: [] };
      const qty = ref(1), activityId = ref(key === "detail" ? "DEVICEgift" : "USDTgift");
      const invalidate = vi.fn();
      // Adapt Uni notification registration only; execute the page's real watcher and Vue hooks.
      const controls = runSticky({
        ref, watch, useStickyCTA, catalogStatus, product: catalog,
        isShare: ref(false), isLocked: ref(false), purchaseUnavailable: ref(false), stockUnavailable: ref(false),
        priceText: computed(() => catalog.value.price.toLocaleString()),
        dailyEarnText: computed(() => catalog.value.dailyEarn.toFixed(2)),
        paybackLabel: computed(() => translations.value.store.detPaybackUnavailable),
        purchaseGate: ref({ blocked: false }), eligibility: ref({ status: "ready", eligible: true }),
        purchaseEligibilityMessage: ref(""), remoteApiEnabled: true, t: translations,
        purchaseEligibilityUnlockHref: vi.fn(), activityId, promotionStatus: ref("ready"), promotionAvailable: ref(true),
        activity: ref({ productNos: [catalog.value.id], eligibility: "ESTIMATE_ELIGIBLE" }), qty, promotionCheckoutHref,
        onShow: (callback: () => void) => hooks.onShow.push(callback),
        onHide: (callback: () => void) => hooks.onHide.push(callback),
        onUnload: (callback: () => void) => hooks.onUnload.push(callback),
        onActivated, onDeactivated, onUnmounted, invalidateDetailFacts: invalidate,
      }) as StickyPage["controls"];
      instances.set(key, { instance: getCurrentInstance()!, hooks, invalidate, qty, activityId, controls });
      return () => h("detail");
    },
  })]));
  pages.set("store", defineComponent({ name: "StickyStore", setup: () => () => h("store") }));
  const current = ref("detail"), cached = ref(["StickyDetail_detail", "StickyDetail_again", "StickyStore"]);
  const app = renderer.createApp({ setup: () => () => h(KeepAlive, { include: cached.value },
    [h(pages.get(current.value)!, { key: current.value })]) });
  app.mount(host()); closes.push(() => app.unmount());
  await nextTick();
  return {
    sticky, instances, catalog, catalogStatus, translations, cached,
    go: async (key: string) => { current.value = key; await nextTick(); },
    uni: (key: string, hook: PageHook) => instances.get(key)!.hooks[hook].forEach(callback => callback()),
  };
}

describe("store detail sticky lifecycle with real KeepAlive", () => {
  it("fences catalog, quantity and locale updates after cached deactivation without Uni hide", async () => {
    const p = await stickyNavigation();
    const detail = p.instances.get("detail")!;
    expect(p.sticky.cta).not.toBeNull();
    await p.go("store");
    expect(p.sticky.cta).toBeNull();
    expect(detail.controls.visible()).toBe(false);
    expect(detail.controls.observationEpoch()).toBeGreaterThan(0);
    expect(detail.invalidate).toHaveBeenCalled();
    p.catalog.value = { ...p.catalog.value, price: 1299 };
    await nextTick(); expect(p.sticky.cta).toBeNull();
    detail.qty.value = 3;
    await nextTick(); expect(p.sticky.cta).toBeNull();
    p.translations.value = vietnamese;
    await nextTick(); expect(p.sticky.cta).toBeNull();
  });

  it("restores the cached owner's current activity, quantity and locale without Uni show", async () => {
    const p = await stickyNavigation();
    const detail = p.instances.get("detail")!;
    p.uni("detail", "onHide"); await p.go("store");
    detail.activityId.value = "USDT current"; detail.qty.value = 4;
    p.translations.value = vietnamese;
    await nextTick(); expect(p.sticky.cta).toBeNull();
    await p.go("detail");
    expect(p.instances.get("detail")).toBe(detail);
    const query = new URL(p.sticky.cta!.href, "https://nexgrid.invalid").searchParams;
    expect(query.get("activityId")).toBe("USDT current");
    expect(JSON.parse(query.get("items")!)).toEqual([{ productNo: "stellarbox-pro", quantity: 4 }]);
    expect(p.sticky.cta!.buttonLabel).toBe(vietnamese.store.cardBuyNow);
  });

  it("keeps a replacement instance's CTA through the old owner's late hide and unmount", async () => {
    const p = await stickyNavigation();
    const old = p.instances.get("detail")!;
    await p.go("again");
    expect(p.instances.get("again")!.instance).not.toBe(old.instance);
    const replacement = p.sticky.cta!.href;
    p.uni("detail", "onHide"); await nextTick();
    expect(p.sticky.cta!.href).toBe(replacement);
    const invalidationsBeforeUnmount = old.invalidate.mock.calls.length;
    p.cached.value = ["StickyDetail_again", "StickyStore"];
    await nextTick(); expect(old.instance.isUnmounted).toBe(true);
    expect(old.invalidate.mock.calls.length).toBeGreaterThan(invalidationsBeforeUnmount);
    expect(p.sticky.cta!.href).toBe(replacement);
    old.qty.value = 8; await nextTick();
    expect(p.sticky.cta!.href).toBe(replacement);
  });

  it.each(["onHide", "onUnload"] as const)("clears synchronously on %s while allowing a normal cached return", async hook => {
    const p = await stickyNavigation();
    const detail = p.instances.get("detail")!;
    p.uni("detail", hook);
    expect(p.sticky.cta).toBeNull();
    expect(detail.controls.visible()).toBe(false);
    expect(detail.invalidate).toHaveBeenCalled();
    detail.qty.value = 2; await nextTick(); expect(p.sticky.cta).toBeNull();
    await p.go("store"); await p.go("detail");
    expect(p.instances.get("detail")).toBe(detail);
    expect(JSON.parse(new URL(p.sticky.cta!.href, "https://nexgrid.invalid").searchParams.get("items")!))
      .toEqual([{ productNo: "stellarbox-pro", quantity: 2 }]);
  });

  it("reasserts the current payload on show even when its visibility was already true", async () => {
    const p = await stickyNavigation();
    const detail = p.instances.get("detail")!;
    p.sticky.hide(detail.controls.stickyOwner);
    expect(detail.controls.stickyPageVisible.value).toBe(true);
    p.uni("detail", "onShow");
    expect(p.sticky.cta).not.toBeNull();
    expect(p.sticky.cta!.href).toContain("activityId=DEVICEgift");
  });
});
