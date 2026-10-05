import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductCatalogSnapshot } from "@/api/product-catalog-api";

const state = vi.hoisted(() => ({
  environment: "prod",
  auth: { isAuthenticated: false, accountId: "default" },
  session: null as { user: { userId: number } } | null,
  catalog: vi.fn(),
  fleet: vi.fn(),
}));

vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  apiRuntimeConfig: { get environment() { return state.environment; } },
  sessionVault: { read: () => state.session },
  productCatalogApi: { catalog: state.catalog },
}));
vi.mock("@/api/order-api", () => ({ advanceRuntimeRevision: vi.fn() }));
vi.mock("@/store/auth", () => ({ useAuth: () => state.auth }));
vi.mock("@/store/app", () => ({ useApp: () => ({ refreshRemoteFleet: state.fleet }) }));

function deferred() {
  let resolve!: (value: ProductCatalogSnapshot) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ProductCatalogSnapshot>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function snapshot(revision = "restored"): ProductCatalogSnapshot {
  return {
    source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision,
    products: [{
      id: "stellarbox-s1", name: "UVELBox S1", tier: "Entry", tagline: "Server device", features: [],
      price: 1299, dailyEarn: 7, dailyEarnNEX: 40, sold: 0, stock: 99999,
      available: true, purchaseBlocked: false,
    }],
  };
}

function authenticate(userId = 7001) {
  state.session = { user: { userId } };
  state.auth.isAuthenticated = true;
  state.auth.accountId = `user:${userId}`;
}

async function stores() {
  const catalog = await import("@/store/product-catalog");
  const bootstrap = await import("./e3-fleet-bootstrap");
  const products = await import("@/mock/products");
  catalog.prepareProductCatalog();
  return { ...catalog, ...bootstrap, ...products };
}

describe("restored-account catalog bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    state.environment = "prod";
    state.auth.isAuthenticated = false;
    state.auth.accountId = "default";
    state.session = null;
    state.fleet.mockResolvedValue(true);
  });

  // These are real catalog generations and the real shared PRODUCTS read surface.
  // The external rebind event is represented by prepareProductCatalog, without
  // inventing a page onShow or a test-owned replacement read after restoration.
  it.each(["prod", "dev"])("recovers the %s catalog after the pre-restore page read has already failed", async environment => {
    state.environment = environment;
    const h = await stores();
    state.catalog.mockRejectedValueOnce(new Error("AUTH_SESSION_REQUIRED"));
    await expect(h.refreshProductCatalog(true)).resolves.toBe(false);
    expect(h.productCatalogState.status).toBe("error");

    authenticate();
    h.prepareProductCatalog();
    const replacement = deferred();
    state.catalog.mockReturnValueOnce(replacement.promise);
    const restored = h.refreshRemoteFleetAfterCatalog("user:7001");

    expect(state.catalog).toHaveBeenCalledTimes(2);
    expect(state.fleet).toHaveBeenCalledTimes(environment === "dev" ? 0 : 1);
    expect(h.PRODUCTS).toEqual([]);
    replacement.resolve(snapshot());
    await expect(restored).resolves.toBe(true);
    await vi.waitFor(() => expect(h.productCatalogState.status).toBe("ready"));
    expect(h.getProduct("stellarbox-s1")?.price).toBe(1299);
    expect(h.productCatalogPresentation.value?.revision).toBe("restored");
    expect(state.fleet).toHaveBeenCalledTimes(1);
  });

  it.each(["success", "failure"])("replaces the pre-completion request and ignores its late %s after a same-account rebind", async outcome => {
    const h = await stores();
    state.session = { user: { userId: 7001 } }; // Cookie restore installed the vault before UI completion.
    const old = deferred();
    const replacement = deferred();
    state.catalog.mockReturnValueOnce(old.promise).mockReturnValueOnce(replacement.promise);
    const pageRead = h.refreshProductCatalog(true);

    authenticate();
    h.prepareProductCatalog();
    const restored = h.refreshRemoteFleetAfterCatalog("user:7001");
    expect(state.catalog).toHaveBeenCalledTimes(2);
    if (outcome === "success") old.resolve(snapshot("old"));
    else old.reject(new Error("OLD_REQUEST_FAILED"));
    await expect(pageRead).resolves.toBe(false);
    expect(h.productCatalogState.status).toBe("loading");
    expect(h.PRODUCTS).toEqual([]);

    replacement.resolve(snapshot());
    await expect(restored).resolves.toBe(true);
    await vi.waitFor(() => expect(h.productCatalogState.status).toBe("ready"));
    expect(h.productCatalogState.revision).toBe("restored");
    expect(h.getProduct("stellarbox-s1")?.price).toBe(1299);
  });

  it.each(["prod", "dev"])("keeps the existing %s fleet dependency when the replacement catalog fails", async environment => {
    state.environment = environment;
    const h = await stores();
    authenticate();
    const replacement = deferred();
    state.catalog.mockReturnValueOnce(replacement.promise);
    const restored = h.refreshRemoteFleetAfterCatalog("user:7001");
    expect(state.catalog).toHaveBeenCalledTimes(1);
    expect(state.fleet).toHaveBeenCalledTimes(environment === "dev" ? 0 : 1);
    replacement.reject(new Error("CATALOG_UNAVAILABLE"));
    await expect(restored).resolves.toBe(environment === "prod");
    await vi.waitFor(() => expect(h.productCatalogState.status).toBe("error"));
    expect(h.productCatalogState.error).toBe("CATALOG_UNAVAILABLE");
    expect(h.productCatalogState.serverCanonical).toBe(false);
    expect(h.PRODUCTS).toEqual([]);
    expect(state.fleet).toHaveBeenCalledTimes(environment === "dev" ? 0 : 1);
    expect(state.catalog).toHaveBeenCalledTimes(1);
  });

  it.each(["success", "failure"])("keeps an old account's late %s out of the restored account", async outcome => {
    const h = await stores();
    authenticate();
    const old = deferred();
    const current = deferred();
    state.catalog.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const oldPageRead = h.refreshProductCatalog(true);
    authenticate(7002);
    h.prepareProductCatalog();
    await expect(h.refreshRemoteFleetAfterCatalog("user:7001")).resolves.toBe(false);
    const restored = h.refreshRemoteFleetAfterCatalog("user:7002");
    expect(state.catalog).toHaveBeenCalledTimes(2);
    current.resolve(snapshot("account-7002"));
    await expect(restored).resolves.toBe(true);
    await vi.waitFor(() => expect(h.productCatalogState.revision).toBe("account-7002"));
    if (outcome === "success") old.resolve(snapshot("account-7001"));
    else old.reject(new Error("OLD_ACCOUNT_FAILED"));
    await expect(oldPageRead).resolves.toBe(false);
    expect(h.productCatalogState.status).toBe("ready");
    expect(h.productCatalogPresentation.value?.revision).toBe("account-7002");
    expect(h.getProduct("stellarbox-s1")?.price).toBe(1299);
    expect(state.fleet).toHaveBeenCalledTimes(1);
  });

  it.each(["missing-session", "unauthenticated", "wrong-auth-account", "wrong-server-account"])("does not read business data for %s", async invalid => {
    const h = await stores();
    authenticate();
    if (invalid === "missing-session") state.session = null;
    if (invalid === "unauthenticated") state.auth.isAuthenticated = false;
    if (invalid === "wrong-auth-account") state.auth.accountId = "user:7002";
    if (invalid === "wrong-server-account") state.session = { user: { userId: 7002 } };
    await expect(h.refreshRemoteFleetAfterCatalog("user:7001")).resolves.toBe(false);
    expect(state.catalog).not.toHaveBeenCalled();
    expect(state.fleet).not.toHaveBeenCalled();
  });
});
