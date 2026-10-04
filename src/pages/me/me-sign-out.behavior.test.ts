import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./me.vue?raw";
import securitySource from "./security.vue?raw";
import { createSessionVault } from "../../api/session-vault";
import { createApiClient } from "../../api/api-client";
import { createAuthApi } from "../../api/auth-api";
import { createP318AccountPageFence } from "./p3-18-account-page-fence";
import { createRemoteAccountEpoch } from "../../lib/remote-account-epoch";

const user = { userId: 7101, countryCode: "+86", phone: "13800007101", nickname: "Fixture", onboardingComplete: true };
function entry(deps: Record<string, unknown>, raw = source, name = "handleSignOut") {
  const ast = ts.createSourceFile("Me.ts", raw.split('<script setup lang="ts">')[1].split('</script>')[0], ts.ScriptTarget.Latest, true);
  const nodes = ast.statements.filter(n => ts.isFunctionDeclaration(n) && (n.name?.text === name || (raw === securitySource && n.name?.text === "isCurrentSecurityRequest")));
  const code = ts.transpileModule(nodes.map(node => node.getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("deps", `const {${Object.keys(deps)}}=deps;${code};return ${name};`)(deps) as () => Promise<void>;
}

describe("Me explicit sign out failure containment", () => {
  it.each([false, true])("clears the shell after remote logout, including storage deletion failure=%s", async fail => {
    const events: string[] = [];
    const storage = { get: () => null, set: vi.fn(), remove: vi.fn(() => { if (fail) throw new Error("synthetic deletion failure"); }) };
    const vault = createSessionVault(storage);
    vault.save({ accessToken: "synthetic-access", refreshToken: "synthetic-refresh", tokenType: "Bearer", user });
    const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: vi.fn(async () => { events.push("remote"); return { status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: null }, headers: {} }; }) } });
    const authApi = createAuthApi(client, vault);
    const auth = { accountId: "user:7101", signOut: vi.fn(() => events.push("shell")) };
    const toast = { warn: vi.fn() }, navReset = vi.fn(), bind = vi.fn();
    await entry({ uiConfirm: async () => true, remoteApiEnabled: true, authApi, auth, sessionVault: vault,
      app: { interruptAllTasks: vi.fn(), pauseLocalPhoneRuntimeBeforeSignOut: async () => { events.push("pause"); }, bindAccount: bind },
      conversations: { discardHumanOutbox: vi.fn() }, session: { signOutSession: vi.fn() },
      rebindAccountScopedStores: vi.fn(), navReset, toast, t: { value: { me: {}, session: { nativeStorageFailure: "Reopen to retry session cleanup" } } },
    })();
    expect(events).toEqual(["pause", "remote", "shell"]);
    expect(vault.read()).toBeNull();
    expect(bind).toHaveBeenCalledWith("default");
    expect(navReset).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/login/login" }));
    expect(toast.warn).toHaveBeenCalledTimes(fail ? 1 : 0);
  });

  it.each(["pause", "logout"])("preserves a newer login while the older %s is pending", async pendingAt => {
    const vault = createSessionVault();
    vault.save({ accessToken: "synthetic-A-access", refreshToken: "synthetic-A-refresh", tokenType: "Bearer", user });
    let finish!: () => void;
    const pause = vi.fn(() => pendingAt === "pause" ? new Promise<void>(resolve => { finish = resolve; }) : Promise.resolve());
    const request = vi.fn(() => pendingAt === "pause" ? Promise.resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: null }, headers: {} }) : new Promise<{ status: number; data: unknown; headers: {} }>(resolve => {
      finish = () => resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: null }, headers: {} });
    }));
    const authApi = createAuthApi(createApiClient({ baseUrl: "https://example.test", vault, transport: { request } }), vault);
    const auth = { accountId: "user:7101", signOut: vi.fn() }, navReset = vi.fn(), bind = vi.fn();
    const logout = entry({ uiConfirm: async () => true, remoteApiEnabled: true, authApi, auth, sessionVault: vault,
      app: { interruptAllTasks: vi.fn(), pauseLocalPhoneRuntimeBeforeSignOut: pause, bindAccount: bind },
      conversations: { discardHumanOutbox: vi.fn() }, session: { signOutSession: vi.fn() },
      rebindAccountScopedStores: vi.fn(), navReset, toast: { warn: vi.fn() }, t: { value: { me: {}, session: {} } },
    })();
    await vi.waitFor(() => expect(pendingAt === "pause" ? pause : request).toHaveBeenCalledOnce());
    vault.save({ accessToken: "synthetic-B-access", refreshToken: "synthetic-B-refresh", tokenType: "Bearer", user: { ...user, userId: 7102 } });
    auth.accountId = "user:7102";
    finish(); await logout;
    expect(vault.read()?.user.userId).toBe(7102);
    expect(auth.signOut).not.toHaveBeenCalled(); expect(bind).not.toHaveBeenCalled(); expect(navReset).not.toHaveBeenCalled();
    if (pendingAt === "pause") expect(request).not.toHaveBeenCalled();
  });

  it("clears its shell and persisted chain after a late server-accepted refresh during logout", async () => {
    let persisted: unknown = null;
    const storage = { get: () => persisted, set: (value: unknown) => { persisted = value; }, remove: () => { persisted = null; } };
    const vault = createSessionVault(storage);
    const original = { accessToken: "synthetic-original-access", refreshToken: "synthetic-original-refresh", tokenType: "Bearer", user };
    vault.save(original);
    let finish!: () => void;
    const request = vi.fn((input: { url: string }) => input.url.endsWith("/logout")
      ? new Promise<{ status: number; data: unknown; headers: {} }>(resolve => { finish = () => resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: null }, headers: {} }); })
      : Promise.resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: { ...original, accessToken: "synthetic-rotated-access", refreshToken: "synthetic-rotated-refresh" } }, headers: {} }));
    const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request } });
    const authApi = createAuthApi(client, vault);
    const auth = { accountId: "user:7101", signOut: vi.fn() }, navReset = vi.fn(), bind = vi.fn();
    const logout = entry({ uiConfirm: async () => true, remoteApiEnabled: true, authApi, auth, sessionVault: vault,
      app: { interruptAllTasks: vi.fn(), pauseLocalPhoneRuntimeBeforeSignOut: async () => {}, bindAccount: bind },
      conversations: { discardHumanOutbox: vi.fn() }, session: { signOutSession: vi.fn() },
      rebindAccountScopedStores: vi.fn(), navReset, toast: { warn: vi.fn() }, t: { value: { me: {}, session: {} } },
    })();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    await client.refreshSession(); expect(vault.isRefreshContinuation(1)).toBe(true);
    finish(); await logout;
    expect(vault.read()).toBeNull(); expect(createSessionVault(storage).read()).toBeNull();
    expect(auth.signOut).toHaveBeenCalledOnce(); expect(bind).toHaveBeenCalledWith("default");
    expect(navReset).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/login/login" }));
  });
});

describe("Security accepted deletion session cleanup", () => {
  function securityHarness(failRemoval = false, delayed = false) {
    const vault = createSessionVault({ get: () => null, set() {}, remove() { if (failRemoval) throw new Error("synthetic native deletion failure"); } });
    const snapshot = (id = 7101) => ({ accessToken: `synthetic-access-${id}`, refreshToken: `synthetic-refresh-${id}`, tokenType: "Bearer", user: { ...user, userId: id } });
    vault.save(snapshot());
    const epoch = createRemoteAccountEpoch("user:7101");
    const auth = { accountId: "user:7101", signOut: vi.fn() };
    const app = { accountKey: "user:7101", accountBindingEpoch: 0, user: { usdtBalance: 0 }, inFlightWithdrawals: [],
      refreshRemoteFleet: async () => true, refreshRemoteWithdrawals: async () => true,
      interruptAllTasks: vi.fn(), pauseLocalPhoneRuntimeBeforeSignOut: async () => {}, bindAccount: vi.fn() };
    const pageFence = createP318AccountPageFence(() => app.accountKey, () => app.accountBindingEpoch);
    let finish!: () => void;
    const request = vi.fn((input: { url: string }) => delayed && input.url.endsWith("/logout") ? new Promise<{ status: number; data: unknown; headers: {} }>(resolve => {
      finish = () => resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: null }, headers: {} });
    }) : Promise.resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: input.url.endsWith("/refresh") ? { ...snapshot(), accessToken: "synthetic-rotated-access", refreshToken: "synthetic-rotated-refresh" } : null }, headers: {} }));
    const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request } });
    const authApi = createAuthApi(client, vault);
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }, navReset = vi.fn();
    const accountApi = { requestAccountDeletion: vi.fn(async () => ({ requestNo: "SYNTHETIC-REQUEST" })) };
    const run = entry({ auth, app, accountApi, authApi, sessionVault: vault,
      securityBusy: { value: false }, securityPageFence: pageFence, securityPageVisible: true,
      captureAccountScope: () => epoch.snapshot(), isCurrentAccountScope: (scope: ReturnType<typeof epoch.snapshot>) => epoch.isCurrent(scope),
      remoteApiEnabled: true, remoteSecurity: { value: {} }, deletionPending: { value: false },
      deletionPassword: { value: "SYNTHETIC-LOCAL-NOT-A-PASSWORD" }, deletionCommandKey: { value: "" },
      staking: { positions: [], syncRemote: async () => true },
      uiConfirm: async () => true, fmt: (value: string) => value, securityConfirmOwner: "synthetic-page", SECURITY_COMMAND_TABLE: "synthetic-local-table",
      acquireAccountCommandKey: () => "synthetic-command", releaseAccountCommandKey: vi.fn(),
      useConversations: () => ({ discardHumanOutbox: vi.fn() }), securityErrorMessage: () => "synthetic-error",
      session: { signOutSession: vi.fn() }, rebindAccountScopedStores: vi.fn(), navReset, toast,
      t: { value: { login: {}, security: {}, session: { nativeStorageFailure: "Local cleanup unconfirmed" } } },
    }, securitySource, "handleDeleteAccount");
    return { run, vault, snapshot, auth, app, epoch, toast, navReset, accountApi, request, client, finish: () => finish() };
  }

  it.each([false, true])("clears the already-deleted account shell even when local removal fails=%s", async fail => {
    const h = securityHarness(fail); await h.run();
    expect(h.accountApi.requestAccountDeletion).toHaveBeenCalledOnce();
    expect(h.vault.read()).toBeNull();
    expect(h.auth.signOut).toHaveBeenCalledOnce();
    expect(h.app.bindAccount).toHaveBeenCalledWith("default");
    expect(h.navReset).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/login/login" }));
    expect(h.toast.warn).toHaveBeenCalledTimes(fail ? 1 : 0);
  });

  it.each([7101, 7102])("preserves a new login for owner %s while the prior logout is pending", async userId => {
    const h = securityHarness(false, true); const deletion = h.run();
    await vi.waitFor(() => expect(h.request).toHaveBeenCalledOnce());
    h.vault.save(h.snapshot(userId));
    if (userId !== 7101) { h.auth.accountId = `user:${userId}`; h.app.accountKey = h.auth.accountId; h.app.accountBindingEpoch++; h.epoch.bind(h.auth.accountId); }
    h.finish(); await deletion;
    expect(h.vault.read()?.user.userId).toBe(userId);
    expect(h.auth.signOut).not.toHaveBeenCalled();
    expect(h.app.bindAccount).not.toHaveBeenCalled(); expect(h.navReset).not.toHaveBeenCalled();
  });

  it("clears an accepted-deletion shell after a refresh continuation during logout", async () => {
    const h = securityHarness(false, true), deletion = h.run();
    await vi.waitFor(() => expect(h.request).toHaveBeenCalledOnce());
    await h.client.refreshSession(); expect(h.vault.isRefreshContinuation(1)).toBe(true);
    h.finish(); await deletion;
    expect(h.vault.read()).toBeNull(); expect(h.auth.signOut).toHaveBeenCalledOnce();
    expect(h.app.bindAccount).toHaveBeenCalledWith("default");
    expect(h.navReset).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/login/login" }));
  });
});
