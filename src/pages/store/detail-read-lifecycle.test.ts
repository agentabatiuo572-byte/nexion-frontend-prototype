import { describe, expect, it, vi } from "vitest";
import { ref, computed, reactive, shallowRef, watch, nextTick } from "vue";
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
    "ref", "computed", "watch", "app", "Promise", "refreshProductCatalog", "refreshServerProductPhase", "remoteApiEnabled", "refreshTrust", "onLoad", "onShow", "captureAccountScope", "isCurrentAccountScope", "productCatalogState", "observeCanonicalProductDetail", "takeNavigationQuery",
    lifecycleCode,
  )(ref, computed, watch, app, Promise, catalog, phase, true, trust,
    (callback: (options?: Record<string, string>) => Promise<void>) => loaded.push(callback),
    (callback: () => void) => shown.push(callback),
    () => currentAccountScope,
    (scope: typeof currentAccountScope) => scope === currentAccountScope,
    productCatalogState, observe, () => "?id=stellarbox-pro",
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
    const catalogStatus = ref<"loading" | "ready" | "error">("loading");
    const presentation = shallowRef<{ products: Array<{ id: string; name: string }> } | null>(null);
    const legacyProducts: Array<{ id: string; name: string }> = [];
    const product = new Function("computed", "id", "catalogStatus", "remoteApiEnabled", "productCatalogPresentation", "getProduct", productCode)(
      computed, id, catalogStatus, true, presentation, (key: string) => legacyProducts.find((entry) => entry.id === key),
    ) as { value?: { id: string; name: string } };
    expect(product.value).toBeUndefined();
    presentation.value = { products: [{ id: "stellarbox-pro", name: "StellarBox Pro" }] };
    catalogStatus.value = "ready";
    expect(product.value?.name).toBe("StellarBox Pro");
    catalogStatus.value = "error";
    expect(product.value).toBeUndefined();
  });

  it("hides the purchase CTA while a forced catalog refresh is loading or failed", async () => {
    const stickyStart = page.search(/watch\(\r?\n  \[stickyPageVisible, catalogStatus,/);
    const stickyEnd = page.indexOf("onShow(() => {", stickyStart);
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
      ctaCode,
    )(
      watch, ref(true), catalogStatus, product, ref(false), ref(false), ref(false), ref(false),
      ref("1199"), ref("13"), ref("93"), ref({ blocked: false }), ref({ status: "ready", eligible: true }),
      ref(""), sticky, Symbol("detail"), true, ref({ store: { cardBuyNow: "Buy", detPaybackUnavailableNote: "Unavailable" } }),
      ref(null), vi.fn(), vi.fn(),
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
    expect(page).toMatch(/onHide\(\(\) => \{[\s\S]*?invalidateDetailFacts\(\)/);
    expect(page).toMatch(/onUnmounted\(\(\) => \{[\s\S]*?invalidateDetailFacts\(\)/);
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
