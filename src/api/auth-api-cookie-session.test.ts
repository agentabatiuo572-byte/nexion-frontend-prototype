import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { createAuthApi } from "./auth-api";
import { createSessionVault } from "./session-vault";
import { acquireRotationNonce, discardRotationNonce } from "./session-rotation-nonce";

const user = { userId: 3775, countryCode: "+86", phone: "18708173775", nickname: "NexGrid 3775", onboardingComplete: true };
const cookieSession = { accessToken: "access", refreshToken: null, tokenType: "Bearer", user,
  sessionSyncKey: "a".repeat(64) };

afterEach(() => discardRotationNonce());

describe("H5 HttpOnly refresh-cookie session", () => {
  it("accepts a login response without exposing the refresh credential to JavaScript", async () => {
    const request = vi.fn().mockResolvedValue(cookieSession);
    const vault = createSessionVault();
    const auth = createAuthApi({ request } as never, vault, { refreshCredentialMode: "cookie" });

    await expect(auth.login({ countryCode: "+86", phone: user.phone, password: "secret" }))
      .resolves.toMatchObject({ kind: "authenticated", user });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: "/auth/users/login",
      headers: { "X-Nexion-Refresh-Mode": "cookie" },
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
});
