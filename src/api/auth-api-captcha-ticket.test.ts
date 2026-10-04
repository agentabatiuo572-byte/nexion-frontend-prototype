import { expect, test, vi } from "vitest";
import { createAuthApi } from "./auth-api";
import { createSessionVault } from "./session-vault";

const rawPages = import.meta.glob("../pages/login/login.vue", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

test("remote login OTP sends an opaque provider ticket unchanged", async () => {
  const request = vi.fn().mockResolvedValue({
    challengeNo: "LOGIN-0123456789abcdef0123456789abcdef",
    resendAfterSec: 60,
    deliveryHint: "****1234",
  });
  const auth = createAuthApi({ request } as never, createSessionVault());
  const ticket = "provider-issued-opaque-ticket";

  await auth.sendLoginOtp({ countryCode: "+84", phone: "901234567", captchaTicket: ticket });

  expect(request).toHaveBeenCalledWith(expect.objectContaining({
    path: "/auth/users/login/otp/send",
    body: expect.objectContaining({ captchaTicket: ticket }),
    authenticated: false,
  }));
});

test("password login forwards the provider ticket and the login page retries the same password flow", async () => {
  const request = vi.fn().mockResolvedValue({
    user: { userId: 42, countryCode: "+84", phone: "901234567", nickname: "NexGrid", onboardingComplete: true },
    accessToken: null,
    refreshToken: null,
    tokenType: "challenge",
    challengeNo: "OTP-0123456789abcdef0123456789abcdef",
    deliveryHint: "****4567",
  });
  const auth = createAuthApi({ request } as never, createSessionVault());

  await auth.login({ countryCode: "+84", phone: "901234567", password: "secret", captchaTicket: "provider-ticket" });

  expect(request).toHaveBeenCalledWith(expect.objectContaining({
    path: "/auth/users/login",
    body: expect.objectContaining({ captchaTicket: "provider-ticket" }),
    authenticated: false,
  }));
  const page = rawPages["../pages/login/login.vue"] ?? "";
  expect(page).toMatch(/signInWithPassword\(captchaTicket\?: string\)/);
  expect(page).toMatch(/USER_CAPTCHA_REQUIRED[\s\S]*?captchaPurpose\.value = "password"/);
  expect(page).toMatch(/captchaPurpose\.value === "password"[\s\S]*?signInWithPassword\(ticket\)/);
});
