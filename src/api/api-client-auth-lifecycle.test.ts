import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { createSessionVault } from "./session-vault";

afterEach(() => vi.unstubAllGlobals());

describe("API client session lifecycle", () => {
  it("clears an existing account when the browser cannot lock a cookie refresh", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    const vault = createSessionVault();
    vault.save({ accessToken: "expired", refreshToken: "", tokenType: "Bearer",
      refreshCredentialMode: "cookie",
      user: { userId: 7, countryCode: "+86", phone: "13800000007", nickname: "Fixture", onboardingComplete: true } });
    const onUnauthorized = vi.fn();
    const request = vi.fn();
    const api = createApiClient({ baseUrl: "http://127.0.0.1:8110", vault,
      transport: { request }, onUnauthorized, refreshCredentialMode: "cookie" });

    await expect(api.refreshSession()).rejects.toThrow("COOKIE_LOCK_UNAVAILABLE");
    expect(request).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(vault.read()).toBeNull();
  });

  it("still sends chain-revoking logout when browser Web Locks is unavailable", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    const request = vi.fn().mockResolvedValue({
      status: 200, data: { code: 0, message: "success", data: { revoked: true } }, headers: {},
    });
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110", vault: createSessionVault(),
      transport: { request }, refreshCredentialMode: "cookie",
    });
    await expect(api.request({ path: "/auth/users/logout", method: "POST", authenticated: false }))
      .resolves.toEqual({ revoked: true });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("fails a protected prefetch locally when no session exists without evicting a later login", async () => {
    const request = vi.fn();
    const onUnauthorized = vi.fn();
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      vault: createSessionVault(),
      transport: { request },
      onUnauthorized,
    });

    await expect(api.request({ path: "/api/payout-addresses" }))
      .rejects.toThrow("AUTH_SESSION_REQUIRED");
    expect(request).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("rotates an expired H5 access token through the HttpOnly cookie without a JavaScript refresh token", async () => {
    const vault = createSessionVault();
    vault.save({
      accessToken: "expired-access",
      refreshToken: "",
      tokenType: "Bearer",
      user: { userId: 3775, countryCode: "+86", phone: "18708173775", nickname: "NexGrid 3775", onboardingComplete: true },
      refreshCredentialMode: "cookie",
    });
    const request = vi.fn()
      .mockResolvedValueOnce({
        status: 401,
        data: { code: 401, message: "TOKEN_EXPIRED", data: null },
        headers: {},
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          code: 0,
          message: "success",
          data: {
            accessToken: "rotated-access",
            refreshToken: null,
            tokenType: "Bearer",
            user: { userId: 3775, countryCode: "+86", phone: "18708173775", nickname: "NexGrid 3775", onboardingComplete: true },
          },
        },
        headers: {},
      })
      .mockResolvedValueOnce({ status: 200, data: { code: 0, message: "success", data: { ok: true } }, headers: {} });
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      vault,
      transport: { request },
      refreshCredentialMode: "cookie",
    });

    await expect(api.request({ path: "/api/app/home/overview" })).resolves.toEqual({ ok: true });
    const refreshRequest = request.mock.calls[1]?.[0];
    expect(refreshRequest).toMatchObject({
      url: "http://127.0.0.1:8110/auth/users/refresh",
      method: "POST",
      withCredentials: true,
      headers: expect.objectContaining({ "X-Nexion-Refresh-Mode": "cookie" }),
    });
    expect(refreshRequest).not.toHaveProperty("body");
    expect(vault.read()).toMatchObject({
      accessToken: "rotated-access",
      refreshToken: "",
      refreshCredentialMode: "cookie",
    });
  });

  it("safely evicts an account blocklisted by the server without attempting a refresh retry", async () => {
    const vault = createSessionVault();
    vault.save({
      accessToken: "blocked-access",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      user: { userId: 88, countryCode: "+86", phone: "18800000088", nickname: "Blocked", onboardingComplete: true },
    });
    const request = vi.fn().mockResolvedValue({
      status: 403,
      data: { code: 403, message: "ACCOUNT_BLOCKLISTED", data: null },
      headers: {},
    });
    const onUnauthorized = vi.fn();
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      vault,
      transport: { request },
      onUnauthorized,
    });

    await expect(api.request({ path: "/api/app/home/overview" })).rejects.toThrow("ACCOUNT_BLOCKLISTED");
    expect(request).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(vault.read()).toBeNull();
  });

  it("clears a revoked 401 only after its single refresh attempt is rejected", async () => {
    const vault = createSessionVault();
    vault.save({
      accessToken: "expired-access",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      user: { userId: 89, countryCode: "+86", phone: "18800000089", nickname: "Revoked", onboardingComplete: true },
    });
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 401, data: { code: 401, message: "TOKEN_EXPIRED", data: null }, headers: {} })
      .mockResolvedValueOnce({ status: 401, data: { code: 401, message: "REFRESH_TOKEN_REVOKED", data: null }, headers: {} });
    const onUnauthorized = vi.fn();
    const api = createApiClient({ baseUrl: "http://127.0.0.1:8110", vault, transport: { request }, onUnauthorized });

    await expect(api.request({ path: "/api/app/home/overview" })).rejects.toThrow("SESSION_EXPIRED");
    expect(request).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(vault.read()).toBeNull();
  });
});
