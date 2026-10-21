import { expect, test, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { createAuthApi, type AuthApi, type RegistrationRequest } from "@/api/auth-api";
import { createApiClient } from "@/api/api-client";
import { createSessionVault, type KeyValueStorage } from "@/api/session-vault";
import { registerAndLogin } from "./registration-auto-login";

const request: RegistrationRequest = {
  countryCode: "+84",
  phone: "912345678",
  challengeNo: "REG-0123456789abcdef0123456789abcdef",
  code: "123456",
  password: "NexPass9a",
  sponsorCode: null,
};

const settledConflicts = ["USER_REGISTRATION_ACCOUNT_EXISTS", "USER_REGISTRATION_K1_IP_LIMIT",
  "USER_REGISTRATION_SPONSOR_AMBIGUOUS", "USER_REGISTRATION_SPONSOR_STATE_CHANGED", "USER_REGISTRATION_SPONSOR_ENVIRONMENT_MISMATCH"];

test.each(settledConflicts.flatMap(message => [200, 409].map(status => [message, status] as const)))
  ("real AuthApi retires confirmed registration rejection %s (HTTP %s) and permits a corrected operation", async (message, status) => {
    const vault = createSessionVault();
    let saved: unknown;
    const attemptStorage: KeyValueStorage = { get: () => saved, set: value => { saved = value; }, remove: () => { saved = undefined; } };
    const transport = vi.fn().mockResolvedValueOnce({ status, headers: {}, data: { code: 409, message, data: null } })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: { code: 0, message: "ok", data: {
        accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
        user: { userId: 7101, countryCode: request.countryCode, phone: request.phone, nickname: "New", onboardingComplete: true },
      } } });
    const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: transport } });
    const auth = createAuthApi(client, vault, { attemptStorage });
    expect(await registerAndLogin(auth, request, () => true)).toMatchObject({ kind: "registration_error", error: { message } });
    expect(auth.pendingLogin()).toBe(false); expect(saved).toBeUndefined(); expect(vault.read()).toBeNull();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await registerAndLogin(auth, { ...request, challengeNo: "REG-corrected", sponsorCode: null }, () => true))
      .toMatchObject({ kind: "authenticated" });
    expect(transport).toHaveBeenCalledTimes(2);
    const first = transport.mock.calls[0][0], second = transport.mock.calls[1][0];
    expect(first.url).toContain("/auth/users/register"); expect(second.url).toContain("/auth/users/register");
    expect(second.headers["X-NexGrid-Login-Attempt-Id"]).not.toBe(first.headers["X-NexGrid-Login-Attempt-Id"]);
    expect(second.headers["X-NexGrid-Login-Recovery-Key"]).not.toBe(first.headers["X-NexGrid-Login-Recovery-Key"]);
  });

test.each([200, 409])("real AuthApi retains an unclassified registration 409 (HTTP %s) for recovery", async (status) => {
  const vault = createSessionVault();
  const transport = vi.fn().mockResolvedValueOnce({ status, headers: {}, data: { code: 409, message: "UNCLASSIFIED_CONFLICT", data: null } })
    .mockRejectedValueOnce(new Error("recovery unavailable"));
  const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: transport } });
  const auth = createAuthApi(client, vault);
  expect(await registerAndLogin(auth, request, () => true)).toMatchObject({ kind: "login_error", registrationMayBeCommitted: true });
  expect(auth.pendingLogin()).toBe(true); expect(vault.read()).toBeNull();
  expect(transport.mock.calls[1][0].url).toContain("/recover");
  await expect(auth.register(request)).rejects.toThrow("LOGIN_RESULT_UNKNOWN");
  expect(transport).toHaveBeenCalledTimes(2);
});

test.each([false, true])("registration recovery never adopts another pending identity (recoverOnly: %s)", async (recoverOnly) => {
  const vault = createSessionVault();
  const failure = new ApiError({ kind: "network", message: "RESPONSE_LOST" });
  const transport = vi.fn().mockRejectedValueOnce(failure).mockRejectedValueOnce(failure)
    .mockResolvedValue({ status: 200, headers: {}, data: { code: 0, message: "ok", data: {
      accessToken: "original-access", refreshToken: "original-refresh", tokenType: "Bearer",
      user: { userId: 7101, countryCode: request.countryCode, phone: request.phone, nickname: "Original", onboardingComplete: true },
    } } });
  const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: transport } });
  const auth = createAuthApi(client, vault);
  expect(await registerAndLogin(auth, request, () => true)).toMatchObject({ kind: "login_error" });
  const original = auth.pendingLoginContext();
  expect(await registerAndLogin(auth, { ...request, phone: "912345679" }, () => true, recoverOnly))
    .toEqual({ kind: "recovery_required" });
  expect(transport).toHaveBeenCalledTimes(2); expect(vault.read()).toBeNull();
  expect(auth.pendingLogin()).toBe(true); expect(auth.pendingLoginContext()).toEqual(original);
  expect(await registerAndLogin(auth, request, () => true)).toMatchObject({ kind: "authenticated", user: { userId: 7101 } });
  expect(transport).toHaveBeenCalledTimes(3);
  expect(transport.mock.calls[2][0]).toEqual(transport.mock.calls[1][0]);
});

function api(overrides: Partial<AuthApi>): AuthApi {
  return {
    pendingLogin: vi.fn(() => false),
    pendingLoginContext: vi.fn(() => null),
    cancelLoginChallenge: vi.fn(),
    completeProviderLogin: vi.fn(),
    retryLogin: vi.fn(),
    recoverLogin: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    sendLoginOtp: vi.fn(),
    completeOtpLogin: vi.fn(),
    sendPasswordResetOtp: vi.fn(),
    verifyPasswordResetOtp: vi.fn(),
    completePasswordReset: vi.fn(),
    completeTwoFactor: vi.fn(),
    sendRegistrationOtp: vi.fn(),
    verifyRegistrationOtp: vi.fn(),
    oauthExchange: vi.fn(),
    restore: vi.fn(),
    discardSessionIfCurrent: vi.fn(),
    discardSessionForIdentity: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

test("successful registration keeps the single server-issued session without a cookie-clearing login race", async () => {
  const receipt = {
    sponsorCode: "NXAB12CD34EF",
    sponsorDisplayName: "A•••",
    sourceEnvironment: "PRODUCTION" as const,
    giftStatus: "PENDING_REVIEW" as const,
    giftUsdt: 1.25,
    giftNex: 20,
  };
  const authApi = api({
    register: vi.fn().mockResolvedValue({
      kind: "authenticated",
      user: { userId: 7101, countryCode: "+84", phone: "912345678", nickname: "New" },
      vaultRevision: 4,
      registrationReceipt: receipt,
    }),
  });

  const result = await registerAndLogin(authApi, request, () => true);

  expect(authApi.discardSessionIfCurrent).not.toHaveBeenCalled();
  expect(authApi.login).not.toHaveBeenCalled();
  expect(result).toMatchObject({ kind: "authenticated", vaultRevision: 4, registrationReceipt: receipt });
});

test("unknown registration outcome performs one original-attempt recovery", async () => {
  const authApi = api({
    register: vi.fn().mockRejectedValue(new ApiError({
      kind: "network",
      message: "NETWORK_UNAVAILABLE",
      retryable: true,
    })),
    recoverLogin: vi.fn().mockResolvedValue({
      kind: "authenticated",
      user: { userId: 7102, countryCode: "+84", phone: "912345678", nickname: "Recovered" },
      vaultRevision: 1,
    }),
  });

  const result = await registerAndLogin(authApi, request, () => true);

  expect(authApi.recoverLogin).toHaveBeenCalledTimes(1);
  expect(authApi.login).not.toHaveBeenCalled();
  expect(result).toMatchObject({ kind: "authenticated", registrationMayBeCommitted: true });
});

test.each([
  { status: 422, message: "USER_REGISTRATION_OTP_INVALID" },
  { status: 409, message: "USER_REGISTRATION_K1_IP_LIMIT" },
])("authoritative registration rejection $status $message never calls login", async ({ status, message }) => {
  const failure = new ApiError({
    kind: "http",
    message,
    status,
    code: status,
  });
  const authApi = api({ register: vi.fn().mockRejectedValue(failure) });

  const result = await registerAndLogin(authApi, request, () => true);

  expect(authApi.login).not.toHaveBeenCalled();
  expect(result).toEqual({ kind: "registration_error", error: failure });
});

test("a stale registration flow discards only its issued session and does not log in", async () => {
  const authApi = api({
    register: vi.fn().mockResolvedValue({
      kind: "authenticated",
      user: { userId: 7103, countryCode: "+84", phone: "912345678", nickname: "Stale" },
      vaultRevision: 9,
    }),
  });

  const result = await registerAndLogin(authApi, request, () => false);

  expect(authApi.discardSessionIfCurrent).toHaveBeenCalledWith(9);
  expect(authApi.login).not.toHaveBeenCalled();
  expect(result).toEqual({ kind: "stale" });
});

test("an unexpected recovery-login challenge never claims the App as signed in", async () => {
  const authApi = api({
    register: vi.fn().mockRejectedValue(new ApiError({
      kind: "network",
      message: "NETWORK_UNAVAILABLE",
      retryable: true,
    })),
    recoverLogin: vi.fn().mockResolvedValue({
      kind: "challenge",
      user: { userId: 7104, countryCode: "+84", phone: "912345678", nickname: "Challenge" },
      challengeNo: "LOGIN-0123456789abcdef0123456789abcdef",
      deliveryHint: "***4321",
    }),
  });

  const result = await registerAndLogin(authApi, request, () => true);

  expect(result).toMatchObject({ kind: "login_error", registrationMayBeCommitted: true });
});
