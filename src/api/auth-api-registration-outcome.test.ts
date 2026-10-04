import { expect, test, vi } from "vitest";
import { createAuthApi, isRegistrationOutcomeUnknown } from "./auth-api";
import { ApiError } from "./errors";
import { createSessionVault } from "./session-vault";

const request = {
  countryCode: "+84",
  phone: "912345678",
  challengeNo: "REG-0123456789abcdef0123456789abcdef",
  code: "123456",
  password: "NexPass9a",
  sponsorCode: null,
};

test("registration verification uses the public server endpoint without issuing a session", async () => {
  const vault = createSessionVault();
  const send = vi.fn().mockResolvedValue({ status: "REGISTRATION_OTP_VERIFIED" });
  const authApi = createAuthApi({ request: send } as never, vault);
  const verification = { countryCode: request.countryCode, phone: request.phone, challengeNo: request.challengeNo, code: request.code };
  await expect(authApi.verifyRegistrationOtp(verification)).resolves.toEqual({ status: "REGISTRATION_OTP_VERIFIED" });
  expect(send).toHaveBeenCalledExactlyOnceWith({
    path: "/auth/users/register/otp/verify", method: "POST", body: verification, authenticated: false,
  });
  expect(vault.read()).toBeNull();
  expect(vault.revision()).toBe(0);
});

test.each([null, {}, { status: "PASSWORD_RESET_OTP_VERIFIED" }, { status: false }])(
  "registration verification rejects malformed server confirmations: %s", async (data) => {
    const authApi = createAuthApi({ request: async () => data } as never, createSessionVault());
    await expect(authApi.verifyRegistrationOtp(request)).rejects.toMatchObject({
      kind: "protocol", message: "REGISTRATION_OTP_VERIFY_RESPONSE_INVALID",
    });
  },
);

test.each([
  new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE", retryable: true }),
  new ApiError({ kind: "protocol", message: "API_ENVELOPE_INVALID" }),
  new ApiError({ kind: "http", message: "HTTP_503", status: 503, retryable: true }),
])("unknown registration outcome does not persist a session: %s", async (failure) => {
  const vault = createSessionVault();
  const authApi = createAuthApi({
    request: async () => { throw failure; },
  } as never, vault);

  await expect(authApi.register(request)).rejects.toBe(failure);
  expect(vault.read()).toBeNull();
  expect(isRegistrationOutcomeUnknown(failure)).toBe(true);
});

test("authoritative 4xx registration errors remain normal errors, not unknown outcomes", () => {
  expect(isRegistrationOutcomeUnknown(new ApiError({
    kind: "http", message: "USER_REGISTRATION_OTP_INVALID", status: 422, code: 422,
  }))).toBe(false);
});

test("discarding a failed completion consumes its issued vault epoch before best-effort logout", async () => {
  const vault = createSessionVault();
  vault.save({
    accessToken: "issued-access",
    refreshToken: "issued-refresh",
    tokenType: "Bearer",
    user: { userId: 4201, countryCode: "+84", phone: "912345678", nickname: "Issued", onboardingComplete: false },
  });
  const issuedRevision = vault.revision();
  const request = vi.fn().mockResolvedValue({});
  const authApi = createAuthApi({ request } as never, vault);

  authApi.discardSessionIfCurrent(issuedRevision);

  expect(vault.read()).toBeNull();
  await Promise.resolve();
  expect(request).toHaveBeenCalledWith(expect.objectContaining({
    path: "/auth/users/logout",
    body: { refreshToken: "issued-refresh" },
    authenticated: false,
  }));
});

test("discarding a stale issued epoch cannot clear or revoke a newer account", () => {
  const vault = createSessionVault();
  vault.save({
    accessToken: "old-access",
    refreshToken: "old-refresh",
    tokenType: "Bearer",
    user: { userId: 4202, countryCode: "+84", phone: "912345679", nickname: "Old", onboardingComplete: true },
  });
  const issuedRevision = vault.revision();
  vault.save({
    accessToken: "new-access",
    refreshToken: "new-refresh",
    tokenType: "Bearer",
    user: { userId: 4203, countryCode: "+84", phone: "912345677", nickname: "New", onboardingComplete: true },
  });
  const request = vi.fn();
  const authApi = createAuthApi({ request } as never, vault);

  authApi.discardSessionIfCurrent(issuedRevision);

  expect(vault.read()?.user.userId).toBe(4203);
  expect(request).not.toHaveBeenCalled();
});
