import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { createAuthApi } from "./auth-api";
import { createSessionVault, type SessionSnapshot } from "./session-vault";

const userA = {
  userId: 7101,
  countryCode: "+86",
  phone: "13800007101",
  nickname: "Audit A",
  onboardingComplete: true,
};
const userB = {
  userId: 7102,
  countryCode: "+86",
  phone: "13800007102",
  nickname: "Audit B",
  onboardingComplete: true,
};

function snapshot(user: typeof userA, accessToken: string, refreshCredentialMode: "token" | "cookie" = "token"): SessionSnapshot {
  return {
    accessToken,
    refreshToken: refreshCredentialMode === "cookie" ? "" : `refresh-${user.userId}`,
    tokenType: "Bearer",
    user,
    refreshCredentialMode,
  };
}

function sessionResponse(user: typeof userA, accessToken: string, refreshCredentialMode: "token" | "cookie" = "token") {
  return {
    accessToken,
    refreshToken: refreshCredentialMode === "cookie" ? null : `refresh-${user.userId}`,
    tokenType: "Bearer",
    user,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("auth refresh adversarial regressions", () => {
  it("clears the old account when another tab replaces the shared cookie with a different account", async () => {
    const vault = createSessionVault();
    vault.save(snapshot(userA, "expired-a", "cookie"));
    const onUnauthorized = vi.fn();
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 401, data: { code: 401, message: "TOKEN_EXPIRED", data: null }, headers: {} })
      .mockResolvedValueOnce({ status: 200, data: { code: 0, message: "success", data: sessionResponse(userB, "access-b", "cookie") }, headers: {} });
    const api = createApiClient({ baseUrl: "http://127.0.0.1:8110", transport: { request }, vault,
      onUnauthorized, refreshCredentialMode: "cookie" });

    await expect(api.request({ path: "/api/app/home/overview" })).rejects.toThrow("SESSION_EXPIRED");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(vault.read()).toBeNull();
  });

  it("clears protected state when the retried resource rejects the rotated bearer", async () => {
    const vault = createSessionVault();
    vault.save(snapshot(userA, "old-access"));
    const onUnauthorized = vi.fn();
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 401, data: { code: 401, message: "TOKEN_EXPIRED", data: null }, headers: {} })
      .mockResolvedValueOnce({ status: 200, data: { code: 0, message: "success", data: sessionResponse(userA, "new-access") }, headers: {} })
      .mockResolvedValueOnce({ status: 401, data: { code: 401, message: "TOKEN_REVOKED", data: null }, headers: {} });
    const api = createApiClient({ baseUrl: "http://127.0.0.1:8110", transport: { request }, vault, onUnauthorized });

    await expect(api.request({ path: "/api/app/home/overview" })).rejects.toThrow("TOKEN_REVOKED");
    expect(request).toHaveBeenCalledTimes(3);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(vault.read()).toBeNull();
  });

  it("does not clear a newer login when a retried old resource rejects late", async () => {
    const vault = createSessionVault();
    vault.save(snapshot(userA, "old-access"));
    const onUnauthorized = vi.fn();
    const retry = deferred<{ status: number; data: unknown; headers: Record<string, string> }>();
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 401, data: { code: 401, message: "TOKEN_EXPIRED", data: null }, headers: {} })
      .mockResolvedValueOnce({ status: 200, data: { code: 0, message: "success", data: sessionResponse(userA, "new-access") }, headers: {} })
      .mockImplementationOnce(() => retry.promise);
    const api = createApiClient({ baseUrl: "http://127.0.0.1:8110", transport: { request }, vault, onUnauthorized });
    const pending = api.request({ path: "/api/app/home/overview" });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    vault.save(snapshot(userB, "later-login"));
    retry.resolve({ status: 401, data: { code: 401, message: "TOKEN_REVOKED", data: null }, headers: {} });

    await expect(pending).rejects.toThrow("TOKEN_REVOKED");
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(vault.read()).toMatchObject({ accessToken: "later-login", user: userB });
  });

  it("treats USER_REFRESH_NOT_ALLOWED as terminal and consumes the rejected session", async () => {
    const vault = createSessionVault();
    vault.save(snapshot(userA, "expired-access"));
    const onUnauthorized = vi.fn();
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 401, data: { code: 401, message: "TOKEN_EXPIRED", data: null }, headers: {} })
      .mockResolvedValueOnce({ status: 403, data: { code: 403, message: "USER_REFRESH_NOT_ALLOWED", data: null }, headers: {} });
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      transport: { request },
      vault,
      onUnauthorized,
    });

    await expect(api.request({ path: "/api/app/home/overview" })).rejects.toThrow("SESSION_EXPIRED");
    expect(request).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(vault.read()).toBeNull();
  });

  it.each([
    "USER_REFRESH_ENVIRONMENT_FORBIDDEN",
    "USER_REFRESH_COUNTRY_CODE_FORBIDDEN",
    "USER_REFRESH_PHONE_INVALID",
  ])("terminates an existing session when refresh returns terminal 403 %s", async (message) => {
    const vault = createSessionVault();
    vault.save(snapshot(userA, "expired-access"));
    const onUnauthorized = vi.fn();
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 401, data: { code: 401, message: "TOKEN_EXPIRED", data: null }, headers: {} })
      .mockResolvedValueOnce({ status: 403, data: { code: 403, message, data: null }, headers: {} });
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      transport: { request },
      vault,
      onUnauthorized,
    });

    await expect(api.request({ path: "/api/app/home/overview" })).rejects.toThrow("SESSION_EXPIRED");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(vault.read()).toBeNull();
  });

  it("does not treat an ordinary protected-resource 403 as a session eviction", async () => {
    const vault = createSessionVault();
    vault.save(snapshot(userA, "valid-access"));
    const onUnauthorized = vi.fn();
    const request = vi.fn().mockResolvedValue({
      status: 403,
      data: { code: 403, message: "WITHDRAWAL_ROLE_NOT_ALLOWED", data: null },
      headers: {},
    });
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      transport: { request },
      vault,
      onUnauthorized,
    });

    await expect(api.request({ path: "/api/app/wallet/withdraw" })).rejects.toThrow("WITHDRAWAL_ROLE_NOT_ALLOWED");
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(vault.read()).toMatchObject({ accessToken: "valid-access", user: userA });
  });

  it("does not let a rejected old refresh clear a newer vault revision", async () => {
    const vault = createSessionVault();
    vault.save(snapshot(userA, "expired-access"));
    const onUnauthorized = vi.fn();
    const refresh = deferred<{ status: number; data: unknown; headers: Record<string, string> }>();
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 401, data: { code: 401, message: "TOKEN_EXPIRED", data: null }, headers: {} })
      .mockImplementationOnce(() => refresh.promise);
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      transport: { request },
      vault,
      onUnauthorized,
    });

    const pendingRequest = api.request({ path: "/api/app/home/overview" });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    vault.save(snapshot(userB, "new-account-access"));
    refresh.resolve({ status: 403, data: { code: 403, message: "USER_REFRESH_NOT_ALLOWED", data: null }, headers: {} });

    await expect(pendingRequest).rejects.toThrow("SESSION_CHANGED_DURING_REFRESH");
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(vault.read()).toMatchObject({ accessToken: "new-account-access", user: userB });
  });

  it("shares one cookie-refresh POST between AuthApi.restore and ApiClient.refreshSession", async () => {
    const vault = createSessionVault();
    vault.save(snapshot(userA, "old-access", "cookie"));
    const refresh = deferred<{ status: number; data: unknown; headers: Record<string, string> }>();
    const request = vi.fn(() => refresh.promise);
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      transport: { request },
      vault,
      refreshCredentialMode: "cookie",
    });
    const auth = createAuthApi(api, vault, { refreshCredentialMode: "cookie" });

    const restore = auth.restore();
    const clientRefresh = api.refreshSession();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    refresh.resolve({ status: 200, data: { code: 0, message: "success", data: sessionResponse(userA, "rotated-access", "cookie") }, headers: {} });

    await expect(restore).resolves.toMatchObject({ accessToken: "rotated-access", user: userA });
    await expect(clientRefresh).resolves.toMatchObject({ accessToken: "rotated-access", user: userA });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("commits the later cookie rotation after a same-account peer refresh", async () => {
    const vault = createSessionVault();
    vault.save(snapshot(userA, "old-access", "cookie"));
    const response = deferred<{ status: number; data: unknown; headers: Record<string, string> }>();
    const request = vi.fn(() => response.promise);
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110", transport: { request }, vault,
      refreshCredentialMode: "cookie",
    });
    const pending = api.refreshSession();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    vault.refreshIfUnchanged(snapshot(userA, "peer-access", "cookie"), vault.revision());
    response.resolve({ status: 200, data: { code: 0, message: "success", data: sessionResponse(userA, "latest-access", "cookie") }, headers: {} });
    await expect(pending).resolves.toMatchObject({ accessToken: "latest-access" });
    expect(vault.read()?.accessToken).toBe("latest-access");
  });

  it("does not let an older cookie restore overwrite a newer vault revision", async () => {
    const vault = createSessionVault();
    const refresh = deferred<{ status: number; data: unknown; headers: Record<string, string> }>();
    const request = vi.fn(() => refresh.promise);
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      transport: { request },
      vault,
      refreshCredentialMode: "cookie",
    });
    const auth = createAuthApi(api, vault, { refreshCredentialMode: "cookie" });
    const restore = auth.restore();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    // This is the atomic commit a successful newer login would have made while
    // this cookie restoration was still in flight.
    vault.save(snapshot(userB, "new-login-access", "cookie"));
    refresh.resolve({ status: 200, data: { code: 0, message: "success", data: sessionResponse(userA, "late-restore-access", "cookie") }, headers: {} });

    await expect(restore).rejects.toThrow("SESSION_CHANGED_DURING_REFRESH");
    expect(vault.read()).toMatchObject({ accessToken: "new-login-access", user: userB });
  });

  it("does not invoke the unauthorized handler for an empty cookie vault with no server session", async () => {
    const vault = createSessionVault();
    const onUnauthorized = vi.fn();
    const request = vi.fn().mockResolvedValue({
      status: 401,
      data: { code: 401, message: "USER_REFRESH_TOKEN_INVALID", data: null },
      headers: {},
    });
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      transport: { request },
      vault,
      onUnauthorized,
      refreshCredentialMode: "cookie",
    });
    const auth = createAuthApi(api, vault, { refreshCredentialMode: "cookie" });

    await expect(auth.restore()).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(vault.revision()).toBe(0);
    expect(vault.read()).toBeNull();
  });

  it("waits for an already-started cookie restore before sending a password login", async () => {
    const vault = createSessionVault();
    const restoreResponse = deferred<{ status: number; data: unknown; headers: Record<string, string> }>();
    const loginResponse = deferred<{ status: number; data: unknown; headers: Record<string, string> }>();
    const request = vi.fn((httpRequest: { url: string }) => {
      if (httpRequest.url.endsWith("/auth/users/refresh")) return restoreResponse.promise;
      if (httpRequest.url.endsWith("/auth/users/login")) return loginResponse.promise;
      throw new Error(`unexpected request: ${httpRequest.url}`);
    });
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      transport: { request },
      vault,
      refreshCredentialMode: "cookie",
    });
    const auth = createAuthApi(api, vault, { refreshCredentialMode: "cookie" });

    const restore = auth.restore();
    const login = auth.login({ countryCode: userB.countryCode, phone: userB.phone, password: "test-only" });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    restoreResponse.resolve({ status: 200, data: { code: 0, message: "success", data: sessionResponse(userA, "restore-access", "cookie") }, headers: {} });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    loginResponse.resolve({ status: 200, data: { code: 0, message: "success", data: sessionResponse(userB, "login-access", "cookie") }, headers: {} });

    await expect(restore).resolves.toMatchObject({ accessToken: "restore-access", user: userA });
    await expect(login).resolves.toMatchObject({ kind: "authenticated", user: userB });
    expect(vault.read()).toMatchObject({ accessToken: "login-access", user: userB });
  });
});
