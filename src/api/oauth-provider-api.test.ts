import { afterEach, expect, test, vi } from "vitest";
import { createOAuthProviderApi, validateOAuthFlow } from "./oauth-provider-api";
import { createAuthApi } from "./auth-api";
import { ApiError } from "./errors";
import { createSessionVault } from "./session-vault";

const flow = { flowId: `OIDC-${"a".repeat(32)}`, flowKey: "k".repeat(43), receipt: "r".repeat(43),
  authorizationUrl: `https://api.example.test/auth/users/oauth/provider/authorize/${"s".repeat(43)}`, expiresInSec: 600 };
const session = { accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
  user: { userId: 42, countryCode: "+84", phone: "901234567", nickname: "User", onboardingComplete: false } };
const options = { clientSurface: "APP" as const, refreshCredentialMode: "token" as const,
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
  const api = createOAuthProviderApi({ request } as never, createAuthApi({ request } as never, vault, options));
  await expect(api.complete("GOOGLE", flow, vault.revision(), undefined, undefined, "captcha")).resolves.toMatchObject({ kind: "authenticated" });
  expect(request.mock.calls[0][0]).toMatchObject({
    path: "/auth/users/oauth/provider/complete", authenticated: false,
    body: { flowId: flow.flowId, flowKey: flow.flowKey, receipt: flow.receipt, provider: "GOOGLE", captchaTicket: "captcha" },
    headers: { "X-NexGrid-Client-Surface": "APP", "X-NexGrid-Login-Attempt-Id": expect.any(String),
      "X-NexGrid-Login-Recovery-Key": expect.any(String), "X-NexGrid-Installation-Id": "installation", "X-NexGrid-Execution-Supported": "true" },
  });
});
test("a browser receipt and unchanged account are required before requesting a session", async () => {
  const request = vi.fn(), vault = createSessionVault(), api = createOAuthProviderApi({ request } as never, createAuthApi({ request } as never, vault, options));
  await expect(api.complete("APPLE", { ...flow, receipt: undefined }, 0)).rejects.toThrow("OAUTH_RESPONSE_INVALID");
  vault.save(session);
  await expect(api.complete("APPLE", flow, 0)).rejects.toThrow("SESSION_CHANGED_DURING_AUTH");
  expect(request).not.toHaveBeenCalled();
});
test("MFA does not save a session and retries reuse the same flow", async () => {
  const request = vi.fn().mockResolvedValue({ accessToken: null, refreshToken: null, tokenType: "Challenge",
    user: { ...session.user, phone: "****4567" }, challengeNo: `OTP-${"b".repeat(32)}`, deliveryHint: "****4567" });
  const vault = createSessionVault(), api = createOAuthProviderApi({ request } as never, createAuthApi({ request } as never, vault, options));
  await expect(api.complete("TELEGRAM", flow, 0)).resolves.toMatchObject({ kind: "challenge" });
  expect(vault.read()).toBeNull();
  request.mockResolvedValue(session);
  await api.complete("TELEGRAM", flow, 0, `OTP-${"b".repeat(32)}`, "123456");
  expect(request.mock.calls[0][0].headers).toEqual(request.mock.calls[1][0].headers);
});
test("a late provider response cannot replace another account", async () => {
  let resolve!: (value: unknown) => void;
  const vault = createSessionVault();
  const client = { request: () => new Promise(done => { resolve = done; }) } as never;
  const api = createOAuthProviderApi(client, createAuthApi(client, vault, options));
  const pending = api.complete("GOOGLE", flow, 0);
  vault.save({ ...session, user: { ...session.user, userId: 99 } });
  resolve(session);
  await expect(pending).rejects.toThrow("SESSION_CHANGED_DURING_AUTH");
  expect(vault.read()?.user.userId).toBe(99);
});

test("lost provider completion survives restart, blocks other logins and recovers the original result", async () => {
  let saved: unknown;
  const storage = { get: () => saved, set: (value: unknown) => { saved = JSON.parse(JSON.stringify(value)); }, remove: () => { saved = undefined; } };
  const request = vi.fn().mockRejectedValueOnce(new ApiError({ kind: "network", message: "lost" }));
  const client = { request } as never, vault = createSessionVault();
  const auth = createAuthApi(client, vault, { ...options, attemptStorage: storage });
  const api = createOAuthProviderApi(client, auth);
  await expect(api.complete("GOOGLE", flow, 0)).rejects.toThrow("lost");
  const original = request.mock.calls[0][0];
  expect(saved).toMatchObject({ pending: true, authMethod: "OAUTH", authReference: `GOOGLE:${flow.flowId}`,
    context: { flowId: flow.flowId, flowKey: flow.flowKey, receipt: flow.receipt } });
  await expect(api.start("APPLE", "LOGIN")).rejects.toThrow("LOGIN_RESULT_UNKNOWN");
  await expect(auth.login({ countryCode: "+84", phone: "901234567", password: "private" })).rejects.toThrow("LOGIN_RESULT_UNKNOWN");
  expect(request).toHaveBeenCalledOnce();
  const restarted = createAuthApi(client, vault, { ...options, executionSupported: () => false, attemptStorage: storage });
  request.mockResolvedValueOnce({ ...session, sessionGroup: "APP", sessionChainId: "original-chain",
    installationId: "installation", appSessionVersion: 7, executionSupported: true });
  await expect(restarted.recoverLogin()).resolves.toMatchObject({ kind: "authenticated" });
  expect(request.mock.calls[1][0]).toMatchObject({ headers: original.headers,
    path: `/auth/users/login/attempts/${original.headers["X-NexGrid-Login-Attempt-Id"]}/recover`,
    body: { authMethod: "OAUTH", authReference: `GOOGLE:${flow.flowId}` } });
  expect(vault.read()).toMatchObject({ sessionGroup: "APP", sessionChainId: "original-chain", appSessionVersion: 7 });
  expect(saved).toBeUndefined();
});

test("ordinary UNKNOWN blocks OAuth complete as well as start", async () => {
  const request = vi.fn().mockRejectedValue(new ApiError({ kind: "network", message: "lost" }));
  const client = { request } as never, auth = createAuthApi(client, createSessionVault(), options);
  await expect(auth.login({ countryCode: "+84", phone: "901234567", password: "private" })).rejects.toThrow("lost");
  const api = createOAuthProviderApi(client, auth);
  await expect(api.complete("GOOGLE", flow, 0)).rejects.toThrow("LOGIN_RESULT_UNKNOWN");
  await expect(api.start("GOOGLE", "LOGIN")).rejects.toThrow("LOGIN_RESULT_UNKNOWN");
  expect(request).toHaveBeenCalledOnce();
});

test("an explicitly unbound provider is rejected without trapping the user in UNKNOWN", async () => {
  const request = vi.fn().mockRejectedValueOnce(new ApiError({ kind: "http", status: 409,
    code: 409, message: "OAUTH_ACCOUNT_LINK_REQUIRED" })).mockResolvedValueOnce(flow);
  const client = { request } as never, auth = createAuthApi(client, createSessionVault(), options);
  const api = createOAuthProviderApi(client, auth);
  await expect(api.complete("TELEGRAM", flow, 0)).rejects.toThrow("OAUTH_ACCOUNT_LINK_REQUIRED");
  expect(auth.pendingLogin()).toBe(false); expect(auth.pendingLoginContext()).toBeNull();
  await expect(api.start("TELEGRAM", "LOGIN")).resolves.toEqual(flow);
});

test("LINK remains authenticated without entering the login attempt coordinator", async () => {
  const request = vi.fn().mockResolvedValueOnce(flow).mockResolvedValueOnce(undefined);
  const auth = createAuthApi({ request } as never, createSessionVault(), options);
  const api = createOAuthProviderApi({ request } as never, auth);
  await api.start("TELEGRAM", "LINK");
  await api.link(flow, "fixture-password");
  expect(request.mock.calls[0][0]).toMatchObject({ authenticated: true, body: { intent: "LINK" } });
  expect(request.mock.calls[1][0]).toMatchObject({ path: "/auth/users/oauth/provider/link",
    body: { flowId: flow.flowId, receipt: flow.receipt, password: "fixture-password" } });
  expect(request.mock.calls[1][0].authenticated).not.toBe(false);
  expect(auth.pendingLoginContext()).toBeNull();
});

test("provider MFA, invalid code and CAPTCHA keep frozen attempt and capability", async () => {
  let capability = false;
  const request = vi.fn().mockResolvedValueOnce({ accessToken: null, refreshToken: null, tokenType: "Challenge",
    user: session.user, challengeNo: `OTP-${"b".repeat(32)}`, deliveryHint: "***" })
    .mockRejectedValueOnce(new ApiError({ kind: "business", code: 422, message: "USER_TWO_FACTOR_CHALLENGE_INVALID" }))
    .mockRejectedValueOnce(new ApiError({ kind: "business", code: 428, message: "USER_CAPTCHA_REQUIRED" }))
    .mockResolvedValueOnce(session);
  const client = { request } as never;
  const api = createOAuthProviderApi(client, createAuthApi(client, createSessionVault(), { ...options, executionSupported: () => capability }));
  await api.complete("TELEGRAM", flow, 0);
  capability = true;
  await expect(api.complete("TELEGRAM", flow, 0, `OTP-${"b".repeat(32)}`, "000000")).rejects.toThrow("USER_TWO_FACTOR_CHALLENGE_INVALID");
  await expect(api.complete("TELEGRAM", flow, 0, `OTP-${"b".repeat(32)}`, "123456")).rejects.toThrow("USER_CAPTCHA_REQUIRED");
  await api.complete("TELEGRAM", flow, 0, `OTP-${"b".repeat(32)}`, "123456", "ticket");
  for (const [call] of request.mock.calls) expect(call.headers).toEqual(request.mock.calls[0][0].headers);
  expect(request.mock.calls[3][0].headers["X-NexGrid-Execution-Supported"]).toBe("false");
});

test("original provider replay uses complete, then accepts MFA through the shared retry UI", async () => {
  const request = vi.fn().mockRejectedValueOnce(new ApiError({ kind: "network", message: "lost" }))
    .mockResolvedValueOnce({ accessToken: null, refreshToken: null, tokenType: "Challenge",
      user: session.user, challengeNo: `OTP-${"b".repeat(32)}`, deliveryHint: "***" })
    .mockRejectedValueOnce(new ApiError({ kind: "business", code: 422, message: "USER_TWO_FACTOR_CHALLENGE_INVALID" }))
    .mockResolvedValueOnce(session);
  const client = { request } as never, auth = createAuthApi(client, createSessionVault(), options);
  await expect(createOAuthProviderApi(client, auth).complete("APPLE", flow, 0)).rejects.toThrow("lost");
  await expect(auth.retryLogin({})).resolves.toMatchObject({ kind: "challenge" });
  await expect(auth.retryLogin({ code: "000000" })).rejects.toThrow("USER_TWO_FACTOR_CHALLENGE_INVALID");
  expect(auth.pendingLoginContext()?.context.challengeNo).toBe(`OTP-${"b".repeat(32)}`);
  await expect(auth.retryLogin({ code: "123456" })).resolves.toMatchObject({ kind: "authenticated" });
  for (const [call] of request.mock.calls) {
    expect(call.path).toBe("/auth/users/oauth/provider/complete");
    expect(call.headers).toEqual(request.mock.calls[0][0].headers);
  }
});

test("a changed installation cannot send cached or persisted provider recovery proof", async () => {
  let installation = "installation", saved: unknown;
  const storage = { get: () => saved, set: (v: unknown) => { saved = v; }, remove: () => { saved = undefined; } };
  const request = vi.fn().mockRejectedValue(new ApiError({ kind: "network", message: "lost" }));
  const client = { request } as never, vault = createSessionVault();
  const configuration = { ...options, installationId: () => installation, attemptStorage: storage };
  const auth = createAuthApi(client, vault, configuration);
  await expect(createOAuthProviderApi(client, auth).complete("GOOGLE", flow, 0)).rejects.toThrow("lost");
  installation = "another-installation";
  await expect(auth.recoverLogin()).rejects.toThrow("LOGIN_INSTALLATION_CHANGED");
  await expect(auth.retryLogin({})).rejects.toThrow("LOGIN_INSTALLATION_CHANGED");
  await expect(createAuthApi(client, vault, configuration).recoverLogin()).rejects.toThrow("LOGIN_INSTALLATION_CHANGED");
  expect(request).toHaveBeenCalledOnce();
});
