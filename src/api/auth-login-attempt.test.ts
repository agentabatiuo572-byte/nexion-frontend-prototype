import { describe, expect, it, vi } from "vitest";
import { createAuthApi, isRegistrationOutcomeUnknown, type AuthApi } from "./auth-api";
import { createSessionVault, type KeyValueStorage } from "./session-vault";
import { ApiError } from "./errors";
import { createApiClient } from "./api-client";

const credentials = { countryCode: "+86", phone: "13800000001", password: "private-password" };
const user = { userId: 1, countryCode: credentials.countryCode, phone: credentials.phone, nickname: "Test", onboardingComplete: true };
const session = { accessToken: "access", refreshToken: "refresh", tokenType: "Bearer", user,
  sessionGroup: "APP" as const, installationId: "install-A", appSessionVersion: 2, sessionChainId: "chain-A", executionSupported: false };
const issuances = [
  ["PASSWORD", (auth: AuthApi) => auth.login(credentials)],
  ["OTP", (auth: AuthApi) => auth.completeOtpLogin({ ...credentials, challengeNo: "original-otp", code: "123456" })],
  ["TWO_FACTOR", (auth: AuthApi) => auth.completeTwoFactor({ ...credentials, challengeNo: "original-2fa", code: "123456" })],
  ["REGISTRATION", (auth: AuthApi) => auth.register({ ...credentials, challengeNo: "original-registration", code: "123456", sponsorCode: null })],
  ["OAUTH", (auth: AuthApi) => auth.oauthExchange({ provider: "GOOGLE" })],
] as const;
function storage() { let record: unknown; return { get: () => record, set: (value: unknown) => { record = JSON.parse(JSON.stringify(value)); }, remove: () => { record = undefined; } } satisfies KeyValueStorage; }
function fixture(request = vi.fn(), saved = storage()) {
  const vault = createSessionVault();
  const auth = createAuthApi({ request } as never, vault, { clientSurface: "APP", installationId: () => "install-A", attemptStorage: saved });
  return { auth, vault, request, saved };
}

describe("durable original login attempt", () => {
  it("keeps password MFA, wrong-code retry and cold continuation on the same frozen attempt", async () => {
    let capability = false;
    const saved = storage(), vault = createSessionVault();
    const request = vi.fn().mockResolvedValueOnce({ tokenType: "challenge", accessToken: null, refreshToken: null,
      user, challengeNo: "challenge-original" })
      .mockRejectedValueOnce(new ApiError({ kind: "business", code: 422, message: "USER_TWO_FACTOR_CHALLENGE_INVALID" }))
      .mockResolvedValueOnce(session);
    const options = { clientSurface: "APP" as const, installationId: () => "install-A",
      executionSupported: () => capability, attemptStorage: saved };
    const auth = createAuthApi({ request } as never, vault, options);
    await expect(auth.login(credentials)).resolves.toMatchObject({ kind: "challenge" });
    capability = true;
    await expect(auth.completeTwoFactor({ ...credentials, challengeNo: "challenge-original", code: "000000" }))
      .rejects.toThrow("USER_TWO_FACTOR_CHALLENGE_INVALID");
    const restarted = createAuthApi({ request } as never, vault, options);
    expect(restarted.pendingLoginContext()).toMatchObject({ authMethod: "TWO_FACTOR", pending: false,
      context: { challengeNo: "challenge-original" } });
    await expect(restarted.retryLogin({ password: credentials.password, code: "123456" }))
      .resolves.toMatchObject({ kind: "authenticated" });
    expect(request.mock.calls[2][0].path).toBe("/auth/users/login/2fa");
    for (const [call] of request.mock.calls) expect(call.headers).toEqual(request.mock.calls[0][0].headers);
  });

  it("restarts a received password challenge through MFA and only cancels known unissued challenges", async () => {
    const saved = storage(), vault = createSessionVault();
    const request = vi.fn().mockResolvedValueOnce({ tokenType: "challenge", accessToken: null, refreshToken: null,
      user, challengeNo: "challenge-original" }).mockRejectedValueOnce(new ApiError({ kind: "network", message: "lost" }));
    const options = { attemptStorage: saved };
    await createAuthApi({ request } as never, vault, options).login(credentials);
    const restarted = createAuthApi({ request } as never, vault, options);
    await expect(restarted.retryLogin({ password: credentials.password, code: "123456" })).rejects.toThrow("lost");
    expect(request.mock.calls[1][0]).toMatchObject({ path: "/auth/users/login/2fa",
      headers: request.mock.calls[0][0].headers, body: { challengeNo: "challenge-original" } });
    expect(() => restarted.cancelLoginChallenge()).toThrow("LOGIN_RESULT_UNKNOWN");
    expect(saved.get()).toMatchObject({ pending: true });
    const challenged = fixture(vi.fn().mockResolvedValue({ tokenType: "challenge", accessToken: null,
      refreshToken: null, user, challengeNo: "challenge-cancellable" }));
    await challenged.auth.login(credentials);
    challenged.auth.cancelLoginChallenge();
    expect(challenged.auth.pendingLoginContext()).toBeNull();
  });
  it.each(issuances.flatMap(([method, invoke]) => [500, 502, 503, 408, 409, 425, 429].map(code => [method, code, invoke] as const)))
    ("keeps %s original attempt/proof after wrapped %s and recovers without reissuing", async (method, code, invoke) => {
      const vault = createSessionVault(), saved = storage();
      const transport = vi.fn().mockResolvedValueOnce({ status: 200, headers: {}, data: { code, message: "WRAPPED_FAILURE", data: null } })
        .mockResolvedValueOnce({ status: 200, headers: {}, data: { code: 0, message: "ok", data: session } });
      const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: transport } });
      const auth = createAuthApi(client, vault, { clientSurface: "APP", installationId: () => "install-A", attemptStorage: saved });
      await expect(invoke(auth)).rejects.toMatchObject({ kind: "business", code });
      expect(auth.pendingLogin()).toBe(true); expect(saved.get()).toMatchObject({ authMethod: method });
      const original = JSON.stringify(saved.get());
      await expect(invoke(auth)).rejects.toThrow("LOGIN_RESULT_UNKNOWN");
      expect(transport).toHaveBeenCalledOnce(); expect(JSON.stringify(saved.get())).toBe(original);
      const restarted = createAuthApi(client, vault, { clientSurface: "APP", installationId: () => "install-A", attemptStorage: saved });
      await expect(restarted.recoverLogin()).resolves.toMatchObject({ kind: "authenticated" });
      expect(transport.mock.calls[1][0]).toMatchObject({ headers: transport.mock.calls[0][0].headers,
        url: expect.stringContaining("/recover"), body: { authMethod: method } });
      expect(restarted.pendingLogin()).toBe(false);
    });

  it("keeps wrapped registration server failures in original-attempt recovery while validation rejection remains final", async () => {
    expect(isRegistrationOutcomeUnknown(new ApiError({ kind: "business", status: 200, code: 503, message: "UNAVAILABLE" }))).toBe(true);
    expect(isRegistrationOutcomeUnknown(new ApiError({ kind: "business", status: 200, code: 422, message: "VALIDATION" }))).toBe(false);
    const f = fixture(vi.fn().mockRejectedValue(new ApiError({ kind: "business", status: 200, code: 422, message: "VALIDATION" })));
    await expect(f.auth.login(credentials)).rejects.toThrow("VALIDATION");
    expect(f.auth.pendingLogin()).toBe(false); expect(f.saved.get()).toBeUndefined();
  });

  it("recovers a lost H5 response through the original cookie-mode HTTP request without APP takeover headers", async () => {
    const vault = createSessionVault(), saved = storage();
    const transport = vi.fn().mockRejectedValueOnce(new ApiError({ kind: "network", message: "response lost" }))
      .mockResolvedValueOnce({ status: 200, headers: {}, data: { code: 0, message: "ok", data: {
        ...session, refreshToken: null, sessionGroup: "H5", installationId: null, appSessionVersion: null } } });
    const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: transport }, refreshCredentialMode: "cookie" });
    const auth = createAuthApi(client, vault, { refreshCredentialMode: "cookie", attemptStorage: saved });
    await expect(auth.login(credentials)).rejects.toThrow("response lost");
    await expect(auth.recoverLogin()).resolves.toMatchObject({ kind: "authenticated" });
    const first = transport.mock.calls[0][0], recovery = transport.mock.calls[1][0];
    expect(recovery.url).toContain(`/login/attempts/${first.headers["X-NexGrid-Login-Attempt-Id"]}/recover`);
    expect(recovery.headers["X-Nexion-Refresh-Mode"]).toBe("cookie");
    expect(recovery.headers).not.toHaveProperty("X-NexGrid-Client-Surface");
    expect(recovery.body).toMatchObject({ installationId: "", executionSupported: false,
      recoveryProof: first.headers["X-NexGrid-Login-Recovery-Key"] });
    expect(vault.read()).toMatchObject({ sessionGroup: "H5", refreshCredentialMode: "cookie", refreshToken: "" });
  });

  it("persists only recovery context before POST and recovers after a cold restart without issuing again", async () => {
    const f = fixture();
    f.request.mockImplementationOnce(async () => {
      expect(f.saved.get()).toMatchObject({ authMethod: "PASSWORD", authReference: "+86:13800000001", pending: true });
      expect(JSON.stringify(f.saved.get())).not.toContain(credentials.password);
      throw new ApiError({ kind: "network", message: "lost" });
    });
    await expect(f.auth.login(credentials)).rejects.toThrow("lost");
    const original = f.request.mock.calls[0][0];
    await expect(f.auth.login(credentials)).rejects.toThrow("LOGIN_RESULT_UNKNOWN");
    expect(f.request).toHaveBeenCalledOnce();
    const next = fixture(vi.fn().mockResolvedValue(session), f.saved);
    await expect(next.auth.recoverLogin()).resolves.toMatchObject({ kind: "authenticated" });
    expect(next.request.mock.calls[0][0]).toMatchObject({ path: expect.stringContaining("/recover"), headers: original.headers,
      body: { authMethod: "PASSWORD", authReference: "+86:13800000001" } });
    expect(next.vault.read()).toMatchObject({ sessionGroup: "APP", appSessionVersion: 2, sessionChainId: "chain-A", executionSupported: false });
    expect(next.auth.pendingLogin()).toBe(false);
  });

  it("re-verifies a lost password challenge with the same identity and proof, then continues 2FA", async () => {
    const f = fixture();
    f.request.mockRejectedValueOnce(new ApiError({ kind: "network", message: "lost challenge" }))
      .mockRejectedValueOnce(new ApiError({ kind: "auth", message: "LOGIN_ATTEMPT_RECOVERY_INVALID" }))
      .mockResolvedValueOnce({ tokenType: "challenge", accessToken: null, refreshToken: null, user, challengeNo: "challenge-original" })
      .mockResolvedValueOnce(session);
    await expect(f.auth.login(credentials)).rejects.toThrow("lost challenge");
    await expect(f.auth.recoverLogin()).rejects.toThrow("LOGIN_ATTEMPT_RECOVERY_INVALID");
    const replay = await f.auth.retryLogin({ password: "re-entered" });
    expect(replay.kind).toBe("challenge");
    expect(f.request.mock.calls[2][0]).toMatchObject({ body: { countryCode: credentials.countryCode, phone: credentials.phone, password: "re-entered" }, headers: f.request.mock.calls[0][0].headers });
    expect(JSON.stringify(f.saved.get())).not.toContain("re-entered");
    await f.auth.completeTwoFactor({ ...credentials, challengeNo: "challenge-original", code: "123456" });
    expect(f.request.mock.calls[3][0].headers).toEqual(f.request.mock.calls[0][0].headers);
    expect(f.auth.pendingLogin()).toBe(false);
  });

  it("retains the original unresolved attempt after a rejected safe replay and never requests a new OAuth challenge", async () => {
    const f = fixture();
    f.request.mockResolvedValueOnce({ challengeNo: `OAUTH-${"1".repeat(32)}`, expiresInSec: 120 })
      .mockRejectedValueOnce(new ApiError({ kind: "network", message: "lost" }))
      .mockRejectedValueOnce(new ApiError({ kind: "auth", message: "CHALLENGE_CONSUMED" }));
    await expect(f.auth.oauthExchange({ provider: "PASSKEY" })).rejects.toThrow("lost");
    await expect(f.auth.retryLogin({})).rejects.toThrow("CHALLENGE_CONSUMED");
    expect(f.request.mock.calls[2][0]).toMatchObject({ path: "/auth/users/oauth/exchange", body: JSON.parse(JSON.stringify(f.request.mock.calls[1][0].body)),
      headers: f.request.mock.calls[1][0].headers });
    expect(f.auth.pendingLogin()).toBe(true);
    await expect(f.auth.oauthExchange({ provider: "GOOGLE" })).rejects.toThrow("LOGIN_RESULT_UNKNOWN");
    expect(f.request).toHaveBeenCalledTimes(3);
  });

  it("shows an ended original session without installing it or reviving it", async () => {
    const f = fixture();
    f.request.mockRejectedValueOnce(new ApiError({ kind: "network", message: "lost" }))
      .mockResolvedValueOnce({ ...session, accessToken: null, refreshToken: null, sessionEndedReason: "APP_REPLACED" });
    await expect(f.auth.login(credentials)).rejects.toThrow("lost");
    await expect(f.auth.recoverLogin()).rejects.toThrow("APP_REPLACED");
    expect(f.vault.read()).toBeNull(); expect(f.auth.pendingLogin()).toBe(false);
  });

  it("rejects a delayed successful response after a newer same-account login", async () => {
    const f = fixture(); let respond!: (value: unknown) => void;
    f.request.mockReturnValue(new Promise(resolve => { respond = resolve; }));
    const pending = f.auth.login(credentials);
    f.vault.save({ ...session, accessToken: "new-access", refreshToken: "new-refresh", sessionChainId: "new-chain" });
    respond(session);
    await expect(pending).rejects.toThrow("SESSION_CHANGED_DURING_AUTH");
    expect(f.vault.read()?.accessToken).toBe("new-access");
  });
});
