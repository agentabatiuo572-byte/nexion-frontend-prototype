import { expect, test, vi } from "vitest";
import { createAuthApi, isRegistrationOutcomeUnknown } from "./auth-api";
import { ApiError } from "./errors";
import { createSessionVault } from "./session-vault";

const request = {
  countryCode: "+81",
  phone: "81987654321",
  challengeNo: "REG-0123456789abcdef0123456789abcdef",
  code: "123456",
  password: "NexPass9a",
  sponsorCode: null,
};

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
    user: { userId: 4201, countryCode: "+81", phone: "9012345678", nickname: "Issued" },
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
    user: { userId: 4202, countryCode: "+81", phone: "9012345679", nickname: "Old" },
  });
  const issuedRevision = vault.revision();
  vault.save({
    accessToken: "new-access",
    refreshToken: "new-refresh",
    tokenType: "Bearer",
    user: { userId: 4203, countryCode: "+81", phone: "9012345680", nickname: "New" },
  });
  const request = vi.fn();
  const authApi = createAuthApi({ request } as never, vault);

  authApi.discardSessionIfCurrent(issuedRevision);

  expect(vault.read()?.user.userId).toBe(4203);
  expect(request).not.toHaveBeenCalled();
});
