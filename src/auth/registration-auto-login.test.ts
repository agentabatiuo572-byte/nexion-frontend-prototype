import { expect, test, vi } from "vitest";
import { ApiError } from "@/api/errors";
import type { AuthApi, RegistrationRequest } from "@/api/auth-api";
import { registerAndLogin } from "./registration-auto-login";

const request: RegistrationRequest = {
  countryCode: "+84",
  phone: "912345678",
  challengeNo: "REG-0123456789abcdef0123456789abcdef",
  code: "123456",
  password: "NexPass9a",
  sponsorCode: null,
};

function api(overrides: Partial<AuthApi>): AuthApi {
  return {
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

test("unknown registration outcome performs one authoritative password-login recovery", async () => {
  const authApi = api({
    register: vi.fn().mockRejectedValue(new ApiError({
      kind: "network",
      message: "NETWORK_UNAVAILABLE",
      retryable: true,
    })),
    login: vi.fn().mockResolvedValue({
      kind: "authenticated",
      user: { userId: 7102, countryCode: "+84", phone: "912345678", nickname: "Recovered" },
      vaultRevision: 1,
    }),
  });

  const result = await registerAndLogin(authApi, request, () => true);

  expect(authApi.login).toHaveBeenCalledTimes(1);
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
    login: vi.fn().mockResolvedValue({
      kind: "challenge",
      user: { userId: 7104, countryCode: "+84", phone: "912345678", nickname: "Challenge" },
      challengeNo: "LOGIN-0123456789abcdef0123456789abcdef",
      deliveryHint: "***4321",
    }),
  });

  const result = await registerAndLogin(authApi, request, () => true);

  expect(result).toMatchObject({ kind: "login_error", registrationMayBeCommitted: true });
});
