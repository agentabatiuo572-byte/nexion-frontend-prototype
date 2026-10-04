import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./App.vue?raw";
import { createApiClient } from "./api/api-client";
import { createAuthApi } from "./api/auth-api";
import { createSessionVault } from "./api/session-vault";
import { ApiError } from "./api/errors";
import { createRemoteAccountEpoch } from "./lib/remote-account-epoch";
import { isPublicAuthRoute } from "./lib/auth-route-visibility";

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

function harness(request = vi.fn(), route = "pages/earn/earn") {
  const vault = createSessionVault();
  const appEpoch = createRemoteAccountEpoch("user:7101");
  const storesEpoch = createRemoteAccountEpoch("user:7101");
  const auth = { isAuthenticated: true, accountId: "user:7101", signOut: vi.fn(() => { auth.isAuthenticated = false; auth.accountId = "default"; }) };
  const app = { accountKey: "user:7101", bindAccount: vi.fn((key: string) => { app.accountKey = key; appEpoch.bind(key); }), interruptAllTasks: vi.fn() };
  const stop = vi.fn();
  const suspendForReauthentication = vi.fn();
  const nav = vi.fn();
  const toast = { warn: vi.fn() };
  let onUnauthorized: () => void = () => {};
  const api = createApiClient({ baseUrl: "https://example.test", transport: { request }, vault, refreshCredentialMode: "cookie", onUnauthorized: () => onUnauthorized() });
  const authApi = createAuthApi(api, vault, { refreshCredentialMode: "cookie" });
  const complete = vi.fn((input: { identity: string }) => { auth.isAuthenticated = true; auth.accountId = input.identity; return { ok: true }; });
  const deps = {
    authApi, sessionVault: vault, useAuth: () => auth, useApp: () => app,
    useSession: () => ({ signOutSession: vi.fn() }),
    useConversations: () => ({ suspendForReauthentication }),
    rebindAccountScopedStores: (key: string) => storesEpoch.bind(key),
    stopBusinessLoops: stop, navReset: nav, completeSignIn: complete,
    hasServerAuthenticatedAccountTrace: () => auth.isAuthenticated && auth.accountId.startsWith("user:"),
    readCurrentRoute: () => route, isAuthWhitelisted: isPublicAuthRoute,
    setRemoteUnauthorizedHandler: (fn: () => void) => { onUnauthorized = fn; },
    toast, ApiError, useT: () => ({ value: { session: { restoreRetryNotice: "Session restore unavailable; retrying" } } }),
  };
  const compiled = new Function("deps", `
    const { ${Object.keys(deps).join(",")} } = deps;
    const auth = useAuth();
    const remoteApiEnabled = true, h5RefreshCookieEnabled = true;
    const SERVER_SESSION_RESTORE_RETRY_MS = 15000;
    let serverSessionRestoreState = 'idle', serverSessionRestoreInFlight = null;
    let serverSessionRestoreRetryAt = 0, serverSessionRestoreNoticeShown = false;
    let secureBrowserUnsupported = false;
    let pendingServerSessionRecovery = false, serverAuthenticatedAccountTraceAtBoot = false, serverSessionProbeAt = 0;
    ${appEntryPoints()}
    return { restore: beginServerSessionRestore, guard: checkAuthGuard, cleanup: clearInvalidRemoteSessionState,
      state: () => serverSessionRestoreState };
  `)(deps) as { restore(): Promise<boolean>; guard(): boolean; cleanup(auth: unknown): void; state(): string };
  return { ...compiled, vault, appEpoch, storesEpoch, auth, app, api, request, stop, nav, toast, complete, suspendForReauthentication };
}

afterEach(() => vi.useRealTimers());

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
    await Promise.resolve();
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
