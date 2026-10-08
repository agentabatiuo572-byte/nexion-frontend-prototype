import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./App.vue?raw";
import { createApiClient } from "./api/api-client";
import { createAuthApi } from "./api/auth-api";
import { createSessionVault, type KeyValueStorage } from "./api/session-vault";
import { ApiError } from "./api/errors";
import { reportNativeSessionStage, reportNativeSessionTiming } from "./api/native-session-storage";
import { createRemoteAccountEpoch } from "./lib/remote-account-epoch";
import { isPublicAuthRoute } from "./lib/auth-route-visibility";
import { preserveRouteDuringSessionRestore } from "./auth/session-restore-route";

const user = { userId: 7101, countryCode: "+86", phone: "13800007101", nickname: "Test", onboardingComplete: true };
const session = (userId = user.userId) => ({ accessToken: `token-${userId}`, refreshToken: "", tokenType: "Bearer", user: { ...user, userId }, refreshCredentialMode: "cookie" as const });
const response = (status: number, data: unknown = null) => ({ status, data: { code: status === 200 ? 0 : status, message: "TEST_RESPONSE", data }, headers: {} });

// Execute the production App entry points. API classification, vault revision,
// and request generations below are real implementations, not source matches.
function appEntryPoints() {
  const body = source.split('<script setup lang="ts">')[1].split('</script>')[0];
  const ast = ts.createSourceFile("App.ts", body, ts.ScriptTarget.Latest, true);
  const names = new Set(["beginServerSessionRestore", "checkAuthGuard", "clearInvalidRemoteSessionState", "canRefreshRemoteAccount"]);
  const parts: string[] = [];
  let unauthorized = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) parts.push(node.getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "setRemoteUnauthorizedHandler") unauthorized = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(parts).toHaveLength(4);
  expect(unauthorized).not.toBe("");
  return ts.transpileModule(parts.join("\n") + "\n" + unauthorized, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}

function harness(request = vi.fn(), route = "pages/earn/earn", native?: { storage: KeyValueStorage; ready?: () => Promise<void> }) {
  const vault = createSessionVault(native?.storage, native ? { deferHydration: true } : undefined);
  const appEpoch = createRemoteAccountEpoch("user:7101");
  const storesEpoch = createRemoteAccountEpoch("user:7101");
  const auth = { isAuthenticated: true, accountId: "user:7101", signOut: vi.fn(() => { auth.isAuthenticated = false; auth.accountId = "default"; }) };
  const app = { accountKey: "user:7101", bindAccount: vi.fn((key: string) => { app.accountKey = key; appEpoch.bind(key); }), interruptAllTasks: vi.fn() };
  const stop = vi.fn();
  const suspendForReauthentication = vi.fn();
  const nav = vi.fn();
  const toast = { warn: vi.fn() };
  let onUnauthorized: () => void = () => {};
  const refreshCredentialMode = native ? "token" : "cookie";
  const api = createApiClient({ baseUrl: "https://example.test", transport: { request }, vault, refreshCredentialMode, onUnauthorized: () => onUnauthorized() });
  const authApi = createAuthApi(api, vault, { refreshCredentialMode });
  const complete = vi.fn((input: { identity: string }) => { auth.isAuthenticated = true; auth.accountId = input.identity; return { ok: true }; });
  const deps = {
    reportNativeSessionStage, reportNativeSessionTiming,
    authApi, sessionVault: vault, useAuth: () => auth, useApp: () => app,
    useSession: () => ({ signOutSession: vi.fn() }),
    useConversations: () => ({ suspendForReauthentication }),
    rebindAccountScopedStores: (key: string) => storesEpoch.bind(key),
    stopBusinessLoops: stop, navReset: nav, completeSignIn: complete,
    hasServerAuthenticatedAccountTrace: () => auth.isAuthenticated && auth.accountId.startsWith("user:"),
    readCurrentRoute: () => route, isAuthWhitelisted: isPublicAuthRoute, preserveRouteDuringSessionRestore,
    setRemoteUnauthorizedHandler: (fn: () => void) => { onUnauthorized = fn; },
    prepareSessionVault: async () => { if (native) { await native.ready?.(); vault.hydrate(); } },
    toast, ApiError, useT: () => ({ value: { session: { restoreRetryNotice: "Session restore unavailable; retrying", nativeStorageFailure: "Session storage unavailable; reopen to retry cleanup" } } }),
  };
  const compiled = new Function("deps", `
    const { ${Object.keys(deps).join(",")} } = deps;
    const auth = useAuth();
    const remoteApiEnabled = true, h5RefreshCookieEnabled = ${!native}, serverSessionRestoreEnabled = true;
    const SERVER_SESSION_RESTORE_RETRY_MS = 15000;
    let serverSessionRestoreState = 'idle', serverSessionRestoreInFlight = null;
    let serverSessionRestoreRetryAt = 0, serverSessionRestoreNoticeShown = false;
    let secureBrowserUnsupported = false;
    let pendingServerSessionRecovery = false, serverAuthenticatedAccountTraceAtBoot = false, serverSessionProbeAt = 0;
    ${appEntryPoints()}
    return { restore: beginServerSessionRestore, guard: checkAuthGuard, cleanup: clearInvalidRemoteSessionState,
      state: () => serverSessionRestoreState, canRefresh: () => canRefreshRemoteAccount(auth) };
  `)(deps) as { restore(): Promise<boolean>; guard(): boolean; cleanup(auth: unknown): void; state(): string; canRefresh(): boolean };
  return { ...compiled, vault, appEpoch, storesEpoch, auth, app, api, authApi, request, stop, nav, toast, complete, suspendForReauthentication };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["success", "empty", "hydrate-failed", "completion-failed"])("records actual App %s recovery stages without secret payloads", async state => {
  const stages: string[] = [];
  vi.stubGlobal("plus", { android: { invoke: (target: string, method: string, tag: string, stage: string) => {
    expect([target, method, tag]).toEqual(["android.util.Log", "i", "UvelAuth"]); stages.push(stage); return 0;
  } } });
  const request = vi.fn().mockResolvedValue(response(200, { ...session(), refreshToken: "synthetic-successor-refresh" }));
  const h = harness(request, "pages/index/index", { storage: {
    get: () => {
      if (state === "hydrate-failed") throw new ApiError({ kind: "configuration", message: "NATIVE_SESSION_STORAGE_UNAVAILABLE" });
      return state === "empty" ? null : { schema: 1, refreshToken: "synthetic-refresh", tokenType: "Bearer", user };
    }, set: vi.fn(), remove: vi.fn(),
  } });
  if (state === "completion-failed") h.complete.mockReturnValue({ ok: false });
  await expect(h.restore()).resolves.toBe(state === "success");
  expect(stages).toEqual(state === "empty" ? ["RESTORE_BEGIN", "HYDRATE_EMPTY", "RESTORE_NO_SESSION"]
    : state === "hydrate-failed" ? ["RESTORE_BEGIN", "RESTORE_STORAGE_FAILED"]
    : ["RESTORE_BEGIN", "HYDRATE_CANDIDATE", "REFRESH_BEGIN", "REFRESH_SERVER_ACCEPTED", "REFRESH_COMMITTED",
      state === "success" ? "UI_COMPLETE_OK" : "UI_COMPLETE_FAILED"]);
  expect(request).toHaveBeenCalledTimes(state === "empty" || state === "hydrate-failed" ? 0 : 1);
  expect(JSON.stringify(stages)).not.toContain("synthetic"); expect(JSON.stringify(stages)).not.toContain(user.phone);
});

it("retains the actual App restore result and authority when both diagnostic channels throw", async () => {
  const invoke = vi.fn(() => { throw new Error("synthetic-secret-bridge-failure"); });
  vi.stubGlobal("plus", { android: { invoke } });
  vi.spyOn(console, "info").mockImplementation(() => { throw new Error("synthetic-secret-console-failure"); });
  const request = vi.fn().mockResolvedValue(response(200, { ...session(), refreshToken: "synthetic-successor-refresh" }));
  const h = harness(request, "pages/index/index", { storage: { get: () => ({ schema: 1, refreshToken: "synthetic-refresh", tokenType: "Bearer", user }), set: vi.fn(), remove: vi.fn() } });
  await expect(h.restore()).resolves.toBe(true);
  expect(h.state()).toBe("ready"); expect(h.auth.isAuthenticated).toBe(true);
  expect(request).toHaveBeenCalledTimes(1); expect(invoke).toHaveBeenCalled();
});

describe("App cookie restoration and expired account isolation", () => {
  it.each([
    ["pages/onboarding/privacy", true, "/pages/onboarding/privacy"],
    ["pages/login/login", false, "/pages/index/index"],
    ["pages/onboarding/intro", false, "/pages/index/index"],
    ["pages/register/register", false, "/pages/index/index"],
    ["pages/earn/earn", true, "/pages/earn/earn"],
  ])("restores authority without displacing the intended %s page", async (route, deferNavigation, returnTo) => {
    const h = harness(vi.fn().mockResolvedValue(response(200, { ...session(), refreshToken: null })), route);
    await expect(h.restore()).resolves.toBe(true);
    expect(h.complete).toHaveBeenCalledWith(expect.objectContaining({ identity: "user:7101", deferNavigation, returnTo }));
    expect(h.vault.read()?.user.userId).toBe(7101);
  });

  it.each([401, 403])("keeps public privacy readable after a %s cookie rejection while clearing account authority", async (status) => {
    const h = harness(vi.fn().mockResolvedValue(response(status)), "pages/onboarding/privacy");
    await expect(h.restore()).resolves.toBe(false);
    expect(h.guard()).toBe(false);
    expect(h.auth.isAuthenticated).toBe(false);
    expect(h.vault.read()).toBeNull();
    expect(h.suspendForReauthentication).toHaveBeenCalled();
    expect(h.suspendForReauthentication.mock.invocationCallOrder[0]).toBeLessThan(h.auth.signOut.mock.invocationCallOrder[0]);
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.nav).not.toHaveBeenCalled();
  });

  it.each(["network", "503", "protocol"])("does not sign out an existing account shell on %s restore failure", async (failure) => {
    const request = vi.fn();
    if (failure === "network") request.mockRejectedValue(new Error("connection lost"));
    else request.mockResolvedValue(response(failure === "503" ? 503 : 200));
    const h = harness(request);
    const old = h.storesEpoch.snapshot();
    await expect(h.restore()).resolves.toBe(false);
    h.guard();
    expect(h.auth.isAuthenticated).toBe(true);
    expect(h.auth.signOut).not.toHaveBeenCalled();
    expect(h.nav).not.toHaveBeenCalled();
    expect(h.storesEpoch.isCurrent(old)).toBe(true);
    expect(h.toast.warn).toHaveBeenCalledTimes(1);
  });

  it("clears authority and keeps routing to login when cookie locking is unavailable", async () => {
    const request = vi.fn().mockRejectedValue(new ApiError({ kind: "configuration", message: "COOKIE_LOCK_UNAVAILABLE" }));
    const h = harness(request);
    await expect(h.restore()).resolves.toBe(false);
    expect(h.auth.isAuthenticated).toBe(false);
    expect(h.nav).toHaveBeenCalledWith({ url: "/pages/login/login?notice=secure-browser-unsupported" });
    h.nav.mockClear();
    expect(h.guard()).toBe(true);
    expect(h.nav).toHaveBeenCalledWith({ url: "/pages/login/login?notice=secure-browser-unsupported" });
  });

  it("backs off retry attempts and resumes from a successful server response", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T00:00:00Z"));
    const request = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(response(200, { ...session(), refreshToken: null }));
    const h = harness(request);
    await h.restore();
    for (let i = 0; i < 5; i++) { h.guard(); await h.restore(); }
    expect(request).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    await expect(h.restore()).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(h.state()).toBe("ready");
    expect(h.auth.signOut).not.toHaveBeenCalled();
  });

  it.each(["network", "503"])("retains an already matching vault on %s restore failure", async (failure) => {
    const request = vi.fn();
    if (failure === "network") request.mockRejectedValue(new Error("offline"));
    else request.mockResolvedValue(response(503));
    const h = harness(request);
    h.vault.save(session());
    const revision = h.vault.revision();
    const pendingRead = h.storesEpoch.snapshot();
    await h.restore();
    h.guard();
    expect(h.state()).toBe("ready");
    expect(h.vault.revision()).toBe(revision);
    expect(h.storesEpoch.isCurrent(pendingRead)).toBe(true);
    expect(h.auth.signOut).not.toHaveBeenCalled();
    expect(h.nav).not.toHaveBeenCalled();
  });

  it.each([401, 403])("clears account generations after a confirmed cold-cookie %s rejection", async (status) => {
    const h = harness(vi.fn().mockResolvedValue(response(status)));
    const appRead = h.appEpoch.snapshot(), storesRead = h.storesEpoch.snapshot();
    await h.restore();
    h.guard();
    expect(h.auth.isAuthenticated).toBe(false);
    expect(h.appEpoch.isCurrent(appRead)).toBe(false);
    expect(h.storesEpoch.isCurrent(storesRead)).toBe(false);
    expect(h.app.accountKey).toBe("default");
    expect(h.stop).toHaveBeenCalled();
    expect(h.app.interruptAllTasks).not.toHaveBeenCalled();
    expect(h.nav).toHaveBeenCalledWith({ url: "/pages/login/login?notice=server-session-reload" });
  });

  it("rejects late old-account reads after the actual unauthorized callback", async () => {
    const h = harness(vi.fn().mockResolvedValue(response(401)));
    h.vault.save(session());
    const appRead = h.appEpoch.snapshot(), storesRead = h.storesEpoch.snapshot();
    await expect(h.api.refreshSession()).rejects.toThrow();
    expect(h.appEpoch.isCurrent(appRead)).toBe(false);
    expect(h.storesEpoch.isCurrent(storesRead)).toBe(false);
    expect(h.vault.read()).toBeNull();
    expect(h.app.interruptAllTasks).not.toHaveBeenCalled();
  });

  it.each([401, 403])("retains the returning-login redirect through both %s rejection callbacks", async (status) => {
    const h = harness(vi.fn().mockResolvedValue(response(status)));
    h.vault.save(session());
    await h.restore();
    // The first navigation can still be in flight when the periodic guard runs.
    h.guard();
    expect(h.nav.mock.calls.length).toBeGreaterThan(0);
    for (const [target] of h.nav.mock.calls) {
      expect(target.url).toBe("/pages/login/login?notice=server-session-reload");
    }
  });

  it("does not initialize account or device stores for a fresh anonymous carrier", async () => {
    const h = harness(vi.fn().mockResolvedValue(response(401)));
    h.auth.isAuthenticated = false;
    h.auth.accountId = "default";
    await h.restore();
    expect(h.app.bindAccount).not.toHaveBeenCalled();
    expect(h.auth.signOut).not.toHaveBeenCalled();
    expect(h.nav).not.toHaveBeenCalled();
  });

  it("keeps a newer login when an older cold-cookie request is denied", async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    const request = vi.fn(() => new Promise<ReturnType<typeof response>>(done => { resolve = done; }));
    const h = harness(request);
    const pending = h.restore();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    h.vault.save(session(7102));
    h.auth.accountId = "user:7102";
    resolve(response(401));
    await pending;
    h.guard();
    expect(h.auth.accountId).toBe("user:7102");
    expect(h.vault.read()?.user.userId).toBe(7102);
    expect(h.auth.signOut).not.toHaveBeenCalled();
    expect(h.nav).not.toHaveBeenCalled();
  });

  it("does not turn an ordinary resource permission denial into logout", async () => {
    const h = harness(vi.fn().mockResolvedValue(response(403)));
    h.vault.save(session());
    await expect(h.api.request({ path: "/api/example" })).rejects.toThrow();
    expect(h.auth.signOut).not.toHaveBeenCalled();
    expect(h.vault.read()?.user.userId).toBe(7101);
  });
});

describe("App native restoration from server accepted identity", () => {
  const persisted = { schema: 1, refreshToken: "synthetic-cold-refresh", tokenType: "Bearer", user };
  const storage = () => ({ get: vi.fn(() => persisted), set: vi.fn(), remove: vi.fn() });
  const nativeSession = (userId = 7101) => ({ ...session(userId), refreshToken: "synthetic-rotated-refresh", refreshCredentialMode: "token" as const });

  it("waits for platform readiness, then refreshes and projects only the accepted server identity", async () => {
    let ready!: () => void;
    const request = vi.fn().mockResolvedValue(response(200, nativeSession()));
    const backing = storage();
    const h = harness(request, "pages/earn/earn", { storage: backing, ready: () => new Promise<void>(resolve => { ready = resolve; }) });
    const restoring = h.restore();
    expect(request).not.toHaveBeenCalled();
    expect(backing.get).not.toHaveBeenCalled();
    expect(h.canRefresh()).toBe(false);
    ready();
    await expect(restoring).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ refreshToken: persisted.refreshToken }) }));
    expect(h.complete).toHaveBeenCalledWith(expect.objectContaining({ identity: "user:7101" }));
    expect(backing.set).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "synthetic-rotated-refresh" }));
    expect(backing.set.mock.calls[0][0]).not.toHaveProperty("accessToken");
    expect(h.canRefresh()).toBe(true);
  });

  it.each([401, 403])("removes a rejected native credential at %s and clears account generations", async status => {
    const backing = storage();
    const h = harness(vi.fn().mockResolvedValue(response(status)), "pages/earn/earn", { storage: backing });
    const old = h.storesEpoch.snapshot();
    await h.restore(); h.guard();
    expect(h.vault.read()).toBeNull();
    expect(backing.remove).toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.auth.isAuthenticated).toBe(false);
    expect(h.storesEpoch.isCurrent(old)).toBe(false);
  });

  it("retains the encrypted refresh candidate on transport failure without granting business access", async () => {
    const backing = storage();
    const h = harness(vi.fn().mockRejectedValue(new Error("offline")), "pages/earn/earn", { storage: backing });
    await h.restore();
    expect(h.vault.read()?.refreshToken).toBe(persisted.refreshToken);
    expect(h.canRefresh()).toBe(false);
    expect(h.complete).not.toHaveBeenCalled();
    expect(backing.remove).not.toHaveBeenCalled();
    expect(h.state()).toBe("idle");
  });

  it("rejects a refresh for a different owner", async () => {
    const backing = storage();
    const h = harness(vi.fn().mockResolvedValue(response(200, nativeSession(7102))), "pages/earn/earn", { storage: backing });
    await h.restore();
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.vault.read()).toBeNull();
    expect(backing.remove).toHaveBeenCalled();
  });

  it.each([200, 401])("does not apply or delete old native owner state after a newer login (late %s)", async status => {
    let finish!: (value: ReturnType<typeof response>) => void;
    const request = vi.fn(() => new Promise<ReturnType<typeof response>>(resolve => { finish = resolve; }));
    const backing = storage(), h = harness(request, "pages/earn/earn", { storage: backing });
    const restoring = h.restore();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    h.vault.save(nativeSession(7102)); h.auth.accountId = "user:7102";
    const removes = backing.remove.mock.calls.length;
    finish(response(status, status === 200 ? nativeSession() : null)); await restoring; h.guard();
    expect(h.vault.read()?.user.userId).toBe(7102);
    expect(h.auth.accountId).toBe("user:7102");
    expect(h.auth.signOut).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
    expect(backing.remove).toHaveBeenCalledTimes(removes);
  });

  it("retries a failed cold native refresh and persists the accepted rotation", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
    const request = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(response(200, nativeSession()));
    const backing = storage(), h = harness(request, "pages/earn/earn", { storage: backing });
    await h.restore(); await h.restore();
    expect(request).toHaveBeenCalledTimes(1); expect(h.canRefresh()).toBe(false);
    vi.advanceTimersByTime(15_000);
    await expect(h.restore()).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(backing.get).toHaveBeenCalledOnce();
    expect(h.canRefresh()).toBe(true);
    expect(backing.set).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "synthetic-rotated-refresh" }));
  });

  it("blocks account work and surfaces a bridge readiness failure", async () => {
    const backing = storage(), request = vi.fn();
    const h = harness(request, "pages/earn/earn", { storage: backing, ready: async () => { throw new ApiError({ kind: "configuration", message: "NATIVE_SESSION_STORAGE_UNAVAILABLE" }); } });
    await expect(h.restore()).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled(); expect(h.canRefresh()).toBe(false);
    expect(h.auth.isAuthenticated).toBe(false); expect(h.stop).toHaveBeenCalled();
    expect(h.toast.warn).toHaveBeenCalled();
    expect(h.nav).toHaveBeenCalledWith({ url: "/pages/login/login" });
  });

  it.each([7101, 7102])("preserves a server-accepted login for %s before an older synchronous native error catch", async userId => {
    const order: string[] = [];
    const backing = { get: vi.fn(() => { order.push("native-get-threw"); throw new ApiError({ kind: "configuration", message: "NATIVE_SESSION_STORAGE_UNAVAILABLE" }); }),
      set: vi.fn(() => order.push("server-accepted-save")), remove: vi.fn(() => order.push("native-catch-cleanup")) };
    const request = vi.fn().mockResolvedValue(response(200, nativeSession(userId)));
    const h = harness(request, "pages/earn/earn", { storage: backing });
    // Real ApiClient/AuthApi awaits put acceptance between hydrate's sync
    // failure and App's catch; this is not a mocked restore error callback.
    const login = h.authApi.login({ countryCode: "+86", phone: user.phone, password: "SYNTHETIC-LOCAL-ONLY" });
    const restoring = h.restore();
    const accepted = await login;
    expect(accepted.kind).toBe("authenticated");
    h.complete({ identity: `user:${userId}` });
    await restoring;
    expect(order.slice(0, 2)).toEqual(["native-get-threw", "server-accepted-save"]);
    expect(backing.remove).not.toHaveBeenCalled();
    expect(h.vault.read()?.user.userId).toBe(userId);
    expect(h.vault.read()?.accessToken).toBe(nativeSession(userId).accessToken);
    expect(h.auth.signOut).not.toHaveBeenCalled(); expect(h.app.bindAccount).not.toHaveBeenCalled();
    expect(h.canRefresh()).toBe(true);
    expect(h.nav).not.toHaveBeenCalled(); expect(h.toast.warn).not.toHaveBeenCalled();
  });

  it("clears the shell and business authority even if durable removal fails", () => {
    const h = harness(vi.fn(), "pages/earn/earn", { storage: { ...storage(), remove: () => { throw new ApiError({ kind: "configuration", message: "NATIVE_SESSION_STORAGE_UNAVAILABLE" }); } } });
    h.vault.save(nativeSession());
    h.cleanup(h.auth);
    expect(h.vault.read()).toBeNull();
    expect(h.auth.isAuthenticated).toBe(false);
    expect(h.app.accountKey).toBe("default");
    expect(h.stop).toHaveBeenCalled();
    expect(h.toast.warn).toHaveBeenCalled();
  });
});
