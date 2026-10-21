import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, type HttpRequest, type HttpResponse } from "./api-client";
import { createAuthApi } from "./auth-api";
import { createSessionVault } from "./session-vault";
import { acquireRotationNonce, discardRotationNonce } from "./session-rotation-nonce";

const user = { userId: 3775, countryCode: "+86", phone: "18708173775", nickname: "NexGrid 3775", onboardingComplete: true };
const cookieSession = { accessToken: "access", refreshToken: null, tokenType: "Bearer", user,
  sessionSyncKey: "a".repeat(64) };

afterEach(() => { vi.unstubAllGlobals(); discardRotationNonce(); });

describe("H5 HttpOnly refresh-cookie session", () => {
  it.each(["success", "rejected", "network"])("late snapshot discard (%s) targets A's captured Bearer and preserves B in both tabs", async (outcome) => {
    // Cookie mutation locks are unavailable; snapshot-only discard must still run.
    vi.stubGlobal("window", {}); vi.stubGlobal("navigator", {});
    const vaultA = createSessionVault(), vaultB = createSessionVault();
    vaultA.save({ ...cookieSession, accessToken: "access-A", refreshToken: "", refreshCredentialMode: "cookie" });
    const revisionA = vaultA.revision();
    const sessionB = { ...cookieSession, accessToken: "access-B", refreshToken: "", refreshCredentialMode: "cookie" as const,
      user: { ...user, userId: 3776 }, sessionSyncKey: "b".repeat(64) };
    vaultB.save(sessionB);
    let finish!: () => void;
    const request = vi.fn((input: HttpRequest): Promise<HttpResponse> => input.url.endsWith("/session/discard")
      ? new Promise((resolve, reject) => { finish = () => outcome === "network" ? reject(new Error("lost")) : resolve({
        status: outcome === "rejected" ? 401 : 200, headers: {},
        data: { code: outcome === "rejected" ? 401 : 0, message: outcome === "rejected" ? "USER_AUTH_REQUIRED" : "ok", data: { revoked: true } },
      }); })
      : Promise.resolve({ status: 200, headers: {}, data: { code: 0, message: "ok", data: { userId: 3776 } } }));
    const unauthorized = vi.fn();
    const clientA = createApiClient({ baseUrl: "https://example.test", vault: vaultA, transport: { request }, refreshCredentialMode: "cookie", onUnauthorized: unauthorized });
    const clientB = createApiClient({ baseUrl: "https://example.test", vault: vaultB, transport: { request }, refreshCredentialMode: "cookie" });
    const authA = createAuthApi(clientA, vaultA, { refreshCredentialMode: "cookie" });
    authA.discardSessionIfCurrent(revisionA);
    expect(vaultA.read()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({ url: "https://example.test/auth/users/session/discard", method: "POST",
      headers: { Authorization: "Bearer access-A", "Content-Type": "application/json" } });
    expect(Object.keys(request.mock.calls[0][0].headers).sort()).toEqual(["Authorization", "Content-Type"]);
    expect(request.mock.calls[0][0]).not.toHaveProperty("body");
    vaultA.save(sessionB);
    finish();
    await clientB.request({ path: "/me" });
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(vaultA.read()).toMatchObject(sessionB); expect(vaultB.read()).toMatchObject(sessionB);
    expect(unauthorized).not.toHaveBeenCalled();
    expect(request.mock.calls.map(([call]) => call.url)).toEqual(["https://example.test/auth/users/session/discard", "https://example.test/me"]);
    expect(request.mock.calls[1][0].headers.Authorization).toBe("Bearer access-B");
    authA.discardSessionIfCurrent(revisionA);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("native snapshot cleanup still revokes the captured refresh token", () => {
    const request = vi.fn().mockResolvedValue(null), vault = createSessionVault();
    vault.save({ ...cookieSession, refreshToken: "native-refresh-A" });
    const auth = createAuthApi({ request } as never, vault);
    auth.discardSessionIfCurrent(vault.revision());
    expect(vault.read()).toBeNull();
    expect(request).toHaveBeenCalledWith({ path: "/auth/users/logout", method: "POST", authenticated: false,
      body: { refreshToken: "native-refresh-A" } });
  });

  it("accepts a login response without exposing the refresh credential to JavaScript", async () => {
    const request = vi.fn().mockResolvedValue(cookieSession);
    const vault = createSessionVault();
    const auth = createAuthApi({ request } as never, vault, { refreshCredentialMode: "cookie" });

    await expect(auth.login({ countryCode: "+86", phone: user.phone, password: "secret" }))
      .resolves.toMatchObject({ kind: "authenticated", user });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: "/auth/users/login",
      headers: expect.objectContaining({ "X-Nexion-Refresh-Mode": "cookie", "X-NexGrid-Execution-Supported": "false",
        "X-NexGrid-Login-Attempt-Id": expect.any(String), "X-NexGrid-Login-Recovery-Key": expect.any(String) }),
    }));
    expect(vault.read()).toMatchObject({ refreshCredentialMode: "cookie", refreshToken: "", user });
    expect(vault.read()?.sessionSyncKey).toBe(cookieSession.sessionSyncKey);
  });

  it("restores an empty in-memory vault from the HttpOnly cookie", async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      data: { code: 0, message: "success", data: cookieSession },
      headers: {},
    });
    const vault = createSessionVault();
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      transport: { request },
      vault,
      refreshCredentialMode: "cookie",
    });
    const auth = createAuthApi(api, vault, { refreshCredentialMode: "cookie" });

    await expect(auth.restore()).resolves.toMatchObject({ accessToken: "access", user });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://127.0.0.1:8110/auth/users/refresh",
      method: "POST",
      withCredentials: true,
      headers: expect.objectContaining({ "X-Nexion-Refresh-Mode": "cookie" }),
    }));
    expect(request.mock.calls[0]?.[0]).not.toHaveProperty("body");
    expect(vault.read()?.accessToken).toBe("access");
    expect(vault.read()?.sessionSyncKey).toBe(cookieSession.sessionSyncKey);
  });

  it("preserves an incomplete-onboarding server session during cookie restore", async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        code: 0,
        message: "success",
        data: {
          ...cookieSession,
          user: { ...user, onboardingComplete: false },
        },
      },
      headers: {},
    });
    const vault = createSessionVault();
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      transport: { request },
      vault,
      refreshCredentialMode: "cookie",
    });
    const auth = createAuthApi(api, vault, { refreshCredentialMode: "cookie" });

    await expect(auth.restore()).resolves.toMatchObject({
      user: { userId: user.userId, onboardingComplete: false },
    });
    expect(vault.read()?.user.onboardingComplete).toBe(false);
  });

  it("logs out through the cookie and never copies a refresh token into the request body", async () => {
    const request = vi.fn().mockResolvedValue(cookieSession);
    const vault = createSessionVault();
    const auth = createAuthApi({ request } as never, vault, { refreshCredentialMode: "cookie" });
    await auth.login({ countryCode: user.countryCode, phone: user.phone, password: "test-only" });
    request.mockClear();

    await auth.logout();

    expect(request).toHaveBeenCalledWith({
      path: "/auth/users/logout",
      method: "POST",
      authenticated: false,
      headers: { "X-Nexion-Refresh-Mode": "cookie" },
    });
    expect(vault.read()).toBeNull();
  });

  it("clears a persisted rotation proof on new login and logout", async () => {
    const request = vi.fn().mockResolvedValue(cookieSession);
    const auth = createAuthApi({ request } as never, createSessionVault(), { refreshCredentialMode: "cookie" });
    const staleProof = acquireRotationNonce();

    await auth.login({ countryCode: user.countryCode, phone: user.phone, password: "secret" });
    const newProof = acquireRotationNonce();
    expect(newProof).not.toBe(staleProof);

    await auth.logout();
    expect(acquireRotationNonce()).not.toBe(newProof);
  });

  it("clears the original cookie chain after a concurrent accepted refresh", async () => {
    const vault = createSessionVault();
    vault.save({ ...cookieSession, refreshToken: "", refreshCredentialMode: "cookie" });
    const revision = vault.revision();
    let finish!: () => void;
    const request = vi.fn((input: { url: string }) => input.url.endsWith("/logout")
      ? new Promise<{ status: number; data: unknown; headers: {} }>(resolve => { finish = () => resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: null }, headers: {} }); })
      : Promise.resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: { ...cookieSession, accessToken: "synthetic-rotated-cookie-access" } }, headers: {} }));
    const api = createApiClient({ baseUrl: "https://example.test", vault, transport: { request }, refreshCredentialMode: "cookie" });
    const auth = createAuthApi(api, vault, { refreshCredentialMode: "cookie" });
    const logout = auth.logout(); await api.refreshSession();
    expect(vault.isRefreshContinuation(revision)).toBe(true);
    finish(); await logout;
    expect(vault.read()).toBeNull();
  });
});
