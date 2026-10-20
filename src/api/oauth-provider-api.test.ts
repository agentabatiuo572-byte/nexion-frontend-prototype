import { afterEach, expect, test, vi } from "vitest";
import { createOAuthProviderApi, validateOAuthFlow } from "./oauth-provider-api";
import { createSessionVault } from "./session-vault";

const flow = { flowId: `OIDC-${"a".repeat(32)}`, flowKey: "k".repeat(43), receipt: "r".repeat(43),
  authorizationUrl: `https://api.example.test/auth/users/oauth/provider/authorize/${"s".repeat(43)}`, expiresInSec: 600 };
const session = { accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
  user: { userId: 42, countryCode: "+84", phone: "901234567", nickname: "User", onboardingComplete: false } };
const options = { surface: "APP" as const, refreshCredentialMode: "token" as const,
  installationId: () => "installation", executionSupported: () => true };
afterEach(() => vi.unstubAllGlobals());
test("native handoff validates canonical HTTPS without the browser URL constructor", () => {
  vi.stubGlobal("URL", undefined);
  expect(validateOAuthFlow(flow)).toEqual(flow);
  for (const host of ["API.example.test:8443/uvel", "api.example.test/gateway.v1", "[2001:db8::1]:8443"]) {
    const authorizationUrl = flow.authorizationUrl.replace("api.example.test", host);
    expect(validateOAuthFlow({ ...flow, authorizationUrl }).authorizationUrl).toBe(authorizationUrl);
  }
  for (const address of [
    flow.authorizationUrl.replace("https:", "http:"),
    flow.authorizationUrl.replace("api.example.test", "user@api.example.test"),
    flow.authorizationUrl.replace("api.example.test", "api.example.test:65536"),
    flow.authorizationUrl.replace("api.example.test", "api.example.test:0"),
    flow.authorizationUrl.replace("/auth/", "/../auth/"),
    flow.authorizationUrl.replace("/auth/", "/%2e%2e/auth/"),
    flow.authorizationUrl.replace("/auth/", "\\auth/"),
    `${flow.authorizationUrl}#fragment`, `${flow.authorizationUrl}?token=secret`,
  ]) expect(() => validateOAuthFlow({ ...flow, authorizationUrl: address })).toThrow("OAUTH_RESPONSE_INVALID");
});
test.each(["javascript:alert(1)", "http://api.example.test/auth", "https://user:secret@example.test/auth",
  `${flow.authorizationUrl}?flowKey=secret`])("rejects unsafe browser handoff %s", authorizationUrl => {
  expect(() => validateOAuthFlow({ ...flow, authorizationUrl })).toThrow("OAUTH_RESPONSE_INVALID");
});
test("real provider completion binds browser receipt, original login attempt and native surface", async () => {
  const request = vi.fn().mockResolvedValue(session), vault = createSessionVault();
  const api = createOAuthProviderApi({ request } as never, vault, options);
  await expect(api.complete("GOOGLE", flow, vault.revision(), undefined, undefined, "captcha")).resolves.toMatchObject({ kind: "authenticated" });
  expect(request.mock.calls[0][0]).toMatchObject({
    path: "/auth/users/oauth/provider/complete", authenticated: false,
    body: { flowId: flow.flowId, flowKey: flow.flowKey, receipt: flow.receipt, provider: "GOOGLE", captchaTicket: "captcha" },
    headers: { "X-NexGrid-Client-Surface": "APP", "X-NexGrid-Login-Attempt-Id": flow.flowId,
      "X-NexGrid-Login-Recovery-Key": flow.flowKey, "X-NexGrid-Installation-Id": "installation", "X-NexGrid-Execution-Supported": "true" },
  });
});
test("a browser receipt and unchanged account are required before requesting a session", async () => {
  const request = vi.fn(), vault = createSessionVault(), api = createOAuthProviderApi({ request } as never, vault, options);
  await expect(api.complete("APPLE", { ...flow, receipt: undefined }, 0)).rejects.toThrow("OAUTH_RESPONSE_INVALID");
  vault.save(session);
  await expect(api.complete("APPLE", flow, 0)).rejects.toThrow("SESSION_CHANGED_DURING_AUTH");
  expect(request).not.toHaveBeenCalled();
});
test("MFA does not save a session and retries reuse the same flow", async () => {
  const request = vi.fn().mockResolvedValue({ accessToken: null, refreshToken: null, tokenType: "Challenge",
    user: { ...session.user, phone: "****4567" }, challengeNo: `OTP-${"b".repeat(32)}`, deliveryHint: "****4567" });
  const vault = createSessionVault(), api = createOAuthProviderApi({ request } as never, vault, options);
  await expect(api.complete("TELEGRAM", flow, 0)).resolves.toMatchObject({ kind: "challenge" });
  expect(vault.read()).toBeNull();
  request.mockResolvedValue(session);
  await api.complete("TELEGRAM", flow, 0, `OTP-${"b".repeat(32)}`, "123456");
  expect(request.mock.calls[0][0].headers).toEqual(request.mock.calls[1][0].headers);
});
test("a late provider response cannot replace another account", async () => {
  let resolve!: (value: unknown) => void;
  const vault = createSessionVault();
  const api = createOAuthProviderApi({ request: () => new Promise(done => { resolve = done; }) } as never, vault, options);
  const pending = api.complete("GOOGLE", flow, 0);
  vault.save({ ...session, user: { ...session.user, userId: 99 } });
  resolve(session);
  await expect(pending).rejects.toThrow("SESSION_CHANGED_DURING_AUTH");
  expect(vault.read()?.user.userId).toBe(99);
});
