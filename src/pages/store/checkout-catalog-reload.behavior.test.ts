import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref, type ComputedRef } from "vue";
import ts from "typescript";
import checkoutSource from "./checkout.vue?raw";
import appSource from "../../App.vue?raw";
import signInSource from "../../auth/complete-sign-in.ts?raw";
import { createApiClient } from "@/api/api-client";
import { createAuthApi } from "@/api/auth-api";
import { createProductCatalogApi } from "@/api/product-catalog-api";
import { createSessionVault, type SessionVault } from "@/api/session-vault";
import { ApiError } from "@/api/errors";
import { resolvePostSignInRoute } from "@/auth/post-sign-in-route";
import type { Product } from "@/mock/products";

const state = vi.hoisted(() => ({
  remote: true, environment: "prod", vault: null as SessionVault | null,
  catalogApi: null as ReturnType<typeof createProductCatalogApi> | null,
  auth: { isAuthenticated: true, accountId: "user:7101", onboardingComplete: true },
  fleet: vi.fn(),
}));
vi.mock("@/api/runtime", () => ({
  get remoteApiEnabled() { return state.remote; },
  apiRuntimeConfig: { get environment() { return state.environment; } },
  get sessionVault() { return state.vault; },
  get productCatalogApi() { return state.catalogApi; },
}));
vi.mock("@/api/order-api", () => ({ advanceRuntimeRevision: vi.fn() }));
vi.mock("@/store/auth", () => ({ useAuth: () => state.auth }));
vi.mock("@/store/app", () => ({ useApp: () => ({ refreshRemoteFleet: state.fleet }) }));

const user = { userId: 7101, countryCode: "+86", phone: "13800007101", nickname: "Test", onboardingComplete: true };
const response = (status: number, data: unknown = null) => ({ status, data: { code: status === 200 ? 0 : status, message: "TEST_RESPONSE", data }, headers: {} });
function snapshot(revision = "restored", price = 1299, id = "stellarbox-s1") {
  return { source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision,
    products: [{ id, name: "UVELBox S1", tier: "Entry", tagline: "managed", productType: "DEVICE", inventoryMode: "FINITE",
      features: [], price, dailyEarn: 7, dailyEarnNEX: 40, sold: 0, stock: 99999, status: "active", available: true, purchaseBlocked: false }] };
}
function deferred() {
  let resolve!: (value: ReturnType<typeof response>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof response>>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Like App's existing recovery tests, execute the production declarations.
// No test-owned copy of checkout's computed, restore, or complete-sign-in logic.
function declarations(source: string, names: string[]) {
  const body = source.includes("<script setup") ? source.split('<script setup lang="ts">')[1].split("</script>")[0] : source;
  const ast = ts.createSourceFile("production.ts", body, ts.ScriptTarget.Latest, true);
  const parts = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(ast))));
  expect(parts).toHaveLength(names.length);
  return ts.transpileModule(parts.map(node => node.getText(ast).replace(/^export\s+/, "")).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
function execute(source: string, deps: Record<string, unknown>, setup: string, result: string) {
  return new Function("deps", `const { ${Object.keys(deps).join(",")} } = deps; ${setup}\n${source}\nreturn ${result};`)(deps);
}

async function harness(seedSession = false) {
  const vault = createSessionVault();
  if (seedSession) vault.save({ accessToken: "test-token-7101", refreshToken: "", tokenType: "Bearer", user, refreshCredentialMode: "cookie" });
  const request = vi.fn();
  const client = createApiClient({ baseUrl: "https://example.test", transport: { request }, vault, refreshCredentialMode: "cookie" });
  const authApi = createAuthApi(client, vault, { refreshCredentialMode: "cookie" });
  state.vault = vault;
  state.catalogApi = createProductCatalogApi(client);
  const catalog = await import("@/store/product-catalog");
  const products = await import("@/mock/products");
  const bootstrap = await import("@/lib/e3-fleet-bootstrap");
  const productId = ref("stellarbox-s1");
  const product = execute(declarations(checkoutSource, ["catalogStatus", "product"]), {
    computed, productId, remoteApiEnabled: state.remote, getProduct: products.getProduct,
    productCatalogState: catalog.productCatalogState, productCatalogPresentation: catalog.productCatalogPresentation,
  }, "", "product") as ComputedRef<Product | undefined>;
  const nav = vi.fn();
  let acknowledge: () => Promise<unknown> = async () => {};
  const auth = Object.assign(state.auth, {
    signIn: vi.fn((identity: string, onboardingComplete: boolean) => {
      state.auth.isAuthenticated = true; state.auth.accountId = identity; state.auth.onboardingComplete = onboardingComplete; return true;
    }), signOut: vi.fn(),
  });
  const session = { accountKey: "user:7101", status: "active", sessionId: "test-session", claim: vi.fn(() => ({ requiresRecalibration: false })) };
  const app = { bindAccount: vi.fn(), projectServerIdentity: vi.fn(), setRemoteTaskForeground: vi.fn(), refreshHomeTruth: vi.fn() };
  const completeSignIn = execute(declarations(signInSource, ["completeSignIn"]), {
    useAuth: () => auth, useApp: () => app, useSession: () => session, remoteApiEnabled: true, authApi, sessionVault: vault,
    rebindAccountScopedStores: () => catalog.prepareProductCatalog(),
    readAccountSessionRecords: () => [{ sessionId: session.sessionId }],
    useProfile: () => ({ projectServerIdentity: vi.fn() }), hydrateCurrentProfileLocale: vi.fn(),
    afterLegalTermsAcknowledged: (callback: () => Promise<unknown>) => { acknowledge = callback; },
    hasPendingLegalTermsRequirement: () => false, hasNativeAndroidPhoneRuntime: () => false,
    refreshRemoteFleetAfterCatalog: bootstrap.refreshRemoteFleetAfterCatalog,
    refreshEarningsReleaseStatus: async () => {}, scheduleLegalTermsGate: async () => {}, resolvePostSignInRoute, navReset: nav,
  }, "const completedSignIns = new Map(); const IDEMPOTENCY_TTL_MS = 600000;", "completeSignIn");
  const restore = execute(declarations(appSource, ["beginServerSessionRestore"]), {
    remoteApiEnabled: true, serverSessionRestoreEnabled: true, sessionVault: vault, authApi, completeSignIn,
    prepareSessionVault: async () => vault.hydrate(), reportNativeSessionStage: vi.fn(), reportNativeSessionTiming: vi.fn(), useAuth: () => auth,
    canRefreshRemoteAccount: () => auth.isAuthenticated && !!vault.read()?.accessToken,
    readCurrentRoute: () => "pages/store/checkout", isAuthWhitelisted: () => false,
    hasServerAuthenticatedAccountTrace: () => true, clearInvalidRemoteSessionState: vi.fn(),
    toast: { warn: vi.fn() }, useT: () => ({ value: { session: { restoreRetryNotice: "retry" } } }), ApiError, navReset: nav,
  }, `let serverSessionRestoreState = 'idle', serverSessionRestoreInFlight = null, serverSessionRestoreRetryAt = 0;
    let serverSessionRestoreNoticeShown = false, pendingServerSessionRecovery = false, serverAuthenticatedAccountTraceAtBoot = false;
    let serverSessionProbeAt = 0, secureBrowserUnsupported = false; const SERVER_SESSION_RESTORE_RETRY_MS = 15000;`, "beginServerSessionRestore") as () => Promise<boolean>;
  catalog.prepareProductCatalog(); // Actual App.onLaunch preparation before cookie restoration.
  const acceptSession = async (userId = 7101, hydration: Promise<ReturnType<typeof response>>) => {
    const refresh = deferred();
    request.mockReturnValueOnce(refresh.promise).mockReturnValueOnce(hydration);
    const restored = restore();
    void product.value; // First template evaluation during cold boot, before restoration finishes.
    await vi.waitFor(() => expect(request.mock.calls.some(([request]) => new URL(request.url).pathname === "/auth/users/refresh")).toBe(true));
    refresh.resolve(response(200, { accessToken: `test-token-${userId}`, refreshToken: null, tokenType: "Bearer", user: { ...user, userId } }));
    await expect(restored).resolves.toBe(true);
    expect(vault.read()?.user.userId).toBe(userId);
    expect(app.bindAccount).toHaveBeenLastCalledWith(`user:${userId}`);
    expect(nav).not.toHaveBeenCalled(); // App keeps the existing checkout route.
    return acknowledge(); // Server legal acknowledgement releases the actual completion callback.
  };
  return { ...catalog, ...products, product, productId, request, vault, auth, nav, acceptSession, bootstrap };
}

describe("checkout catalog projection after authenticated browser reload", () => {
  beforeEach(() => {
    vi.resetModules(); vi.resetAllMocks();
    state.remote = true; state.environment = "prod"; state.vault = null; state.catalogApi = null;
    state.auth.isAuthenticated = true; state.auth.accountId = "user:7101"; state.auth.onboardingComplete = true;
    state.fleet.mockResolvedValue(true);
  });

  it.each(["prod", "dev"])("updates the mounted %s checkout after cookie restore, sign-in rebind, acknowledgement and canonical hydration", async environment => {
    state.environment = environment;
    const h = await harness();
    const hydration = deferred();
    await h.acceptSession(7101, hydration.promise);
    expect(h.request).toHaveBeenCalledTimes(2);
    expect(h.product.value).toBeUndefined();
    hydration.resolve(response(200, snapshot()));
    await vi.waitFor(() => expect(h.productCatalogState.status).toBe("ready"));
    expect(h.productCatalogState.serverCanonical).toBe(true);
    expect(h.productCatalogPresentation.value?.revision).toBe("restored");
    expect(h.product.value).toMatchObject({ id: "stellarbox-s1", price: 1299, stock: 99999 });
    expect(h.productId.value).toBe("stellarbox-s1"); // No remount, navigation or route-id mutation.
    expect(h.request.mock.calls.map(([request]) => new URL(request.url).pathname)).toEqual(["/auth/users/refresh", "/api/store/catalog"]);
  });

  it.each(["network", "noncanonical"])("hides the retained presentation after a current %s catalog failure", async failure => {
    const h = await harness(true);
    h.request.mockResolvedValueOnce(response(200, snapshot()));
    await expect(h.refreshProductCatalog(true)).resolves.toBe(true);
    expect(h.product.value?.price).toBe(1299);
    const failed = deferred(); h.request.mockReturnValueOnce(failed.promise);
    const reading = h.refreshProductCatalog(true);
    const whileLoading = h.product.value;
    if (failure === "network") failed.reject(new Error("CATALOG_UNAVAILABLE"));
    else failed.resolve(response(200, { ...snapshot(), serverCanonical: false }));
    await expect(reading).resolves.toBe(false);
    expect(h.productCatalogState.status).toBe("error");
    expect(h.productCatalogState.serverCanonical).toBe(false);
    expect(h.productCatalogPresentation.value?.revision).toBe("restored");
    expect(whileLoading).toBeUndefined();
    expect(h.product.value).toBeUndefined();
  });

  it("uses each ready canonical replacement and keeps an unknown route SKU missing", async () => {
    const h = await harness(true);
    for (const price of [1299, 1350]) {
      h.request.mockResolvedValueOnce(response(200, snapshot(`price-${price}`, price)));
      await expect(h.refreshProductCatalog(true)).resolves.toBe(true);
      expect(h.product.value?.price).toBe(price);
    }
    h.request.mockResolvedValueOnce(response(200, snapshot("removed", 1299, "other-sku")));
    await expect(h.refreshProductCatalog(true)).resolves.toBe(true);
    expect(h.product.value).toBeUndefined();
    expect(h.productId.value).toBe("stellarbox-s1");
  });

  it.each(["success", "failure"])("clears the previous account and ignores its late %s while the current account hydrates", async outcome => {
    const h = await harness(true);
    h.request.mockResolvedValueOnce(response(200, snapshot("old-account")));
    await h.refreshProductCatalog(true);
    expect(h.product.value?.price).toBe(1299);
    const old = deferred(); h.request.mockReturnValueOnce(old.promise);
    const oldRead = h.refreshProductCatalog(true);
    h.vault.clear(); // A later account's cookie restore starts with no prior bearer authority.
    const hydration = deferred();
    await h.acceptSession(7102, hydration.promise);
    expect(h.productCatalogPresentation.value).toBeNull();
    const whileRebound = h.product.value;
    hydration.resolve(response(200, snapshot("account-7102", 1400)));
    await vi.waitFor(() => expect(h.productCatalogState.status).toBe("ready"));
    if (outcome === "success") old.resolve(response(200, snapshot("account-7101", 900)));
    else old.reject(new Error("OLD_ACCOUNT_UNAVAILABLE"));
    await expect(oldRead).resolves.toBe(false);
    expect(whileRebound).toBeUndefined();
    expect(h.productCatalogPresentation.value?.revision).toBe("account-7102");
    expect(h.product.value?.price).toBe(1400);
  });

  it("preserves the local-mode product read", async () => {
    state.remote = false;
    const h = await harness();
    expect(h.product.value).toBe(h.getProduct("stellarbox-s1"));
    expect(h.product.value).toBeDefined();
    expect(h.request).not.toHaveBeenCalled();
  });
});
