import { describe, expect, it, vi } from "vitest";
import { createAuthApi, type AuthApi } from "./auth-api";
import { createSessionVault } from "./session-vault";

const user = { userId: 3301, countryCode: "+86", phone: "18708173775", nickname: "UVEL User", onboardingComplete: true };
const credentials = { countryCode: user.countryCode, phone: user.phone, password: "test-only" };
const otp = { countryCode: user.countryCode, phone: user.phone, challengeNo: "LOGIN-11111111111111111111111111111111", code: "123456" };
const registration = { ...otp, password: "test-only", sponsorCode: null };

const issuance = [
  ["password login", "/auth/users/login", (auth: AuthApi) => auth.login(credentials)],
  ["OTP login", "/auth/users/login/otp/verify", (auth: AuthApi) => auth.completeOtpLogin(otp)],
  ["2FA login", "/auth/users/login/2fa", (auth: AuthApi) => auth.completeTwoFactor({ ...credentials, challengeNo: otp.challengeNo, code: otp.code })],
  ["registration", "/auth/users/register", (auth: AuthApi) => auth.register(registration)],
  ["OAuth exchange", "/auth/users/oauth/exchange", (auth: AuthApi) => auth.oauthExchange({ provider: "GOOGLE" })],
] as const;

function fixture(cookie: boolean) {
  return { accessToken: "access", refreshToken: cookie ? null : "refresh", tokenType: "Bearer", user,
    source: "provider", sandbox: false };
}

describe("session issuance client surface", () => {
  it.each(issuance)("marks only the APP-PLUS %s issuance request", async (_label, path, invoke) => {
    const request = vi.fn().mockResolvedValue(fixture(false));
    const auth = createAuthApi({ request } as never, createSessionVault(), { clientSurface: "APP" });
    await invoke(auth);
    expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      path, method: "POST", authenticated: false,
      headers: { "X-NexGrid-Client-Surface": "APP" },
    }));
  });

  it.each(issuance)("keeps H5 cookie semantics on %s without an APP surface", async (_label, path, invoke) => {
    const request = vi.fn().mockResolvedValue(fixture(true));
    const auth = createAuthApi({ request } as never, createSessionVault(), { refreshCredentialMode: "cookie" });
    await invoke(auth);
    expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      path, method: "POST", authenticated: false,
      headers: { "X-Nexion-Refresh-Mode": "cookie" },
    }));
  });

  it("does not mark OTP preparation, registration proof, or logout", async () => {
    const request = vi.fn().mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith("/otp/send")) return { challengeNo: path.includes("register")
        ? "REG-11111111111111111111111111111111" : otp.challengeNo, resendAfterSec: 60, deliveryHint: "SMS" };
      if (path.endsWith("/otp/verify")) return { status: "REGISTRATION_OTP_VERIFIED" };
      return {};
    });
    const vault = createSessionVault();
    vault.save({ accessToken: "access", refreshToken: "refresh", tokenType: "Bearer", user });
    const auth = createAuthApi({ request } as never, vault, { clientSurface: "APP" });
    await auth.sendLoginOtp(credentials);
    await auth.sendRegistrationOtp(credentials);
    await auth.verifyRegistrationOtp(otp);
    await auth.logout();
    expect(request.mock.calls.map(([call]) => call.path)).toEqual([
      "/auth/users/login/otp/send", "/auth/users/register/otp/send",
      "/auth/users/register/otp/verify", "/auth/users/logout",
    ]);
    for (const [call] of request.mock.calls) expect(call.headers?.["X-NexGrid-Client-Surface"]).toBeUndefined();
  });
});
