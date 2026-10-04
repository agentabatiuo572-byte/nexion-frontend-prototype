import { expect, test } from "vitest";
import { createAuthApi } from "./auth-api";
import { createSessionVault } from "./session-vault";

const response = (overrides: Record<string, unknown> = {}) => ({
  accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
  user: { userId: 8101, countryCode: "+86", phone: "18708173775", nickname: "Development User", onboardingComplete: true },
  source: "development", sandbox: false, ...overrides,
});

const challenge = { challengeNo: "OAUTH-11111111111111111111111111111111", expiresInSec: 300 };

test("development Passkey consumes a server-issued canonical development challenge", async () => {
  const requests: any[] = [];
  const api = createAuthApi({
    request: async (value: any) => {
      requests.push(value);
      return value.path.endsWith("/challenge") ? challenge : response();
    },
  } as never, createSessionVault());

  await expect(api.oauthExchange({
    provider: "PASSKEY",
  })).resolves.toMatchObject({ source: "development", sandbox: false, user: { userId: 8101 } });
  expect(requests[0]).toMatchObject({
    path: "/auth/users/oauth/development/passkey/challenge", method: "POST", authenticated: false,
    body: { provider: "PASSKEY" },
  });
  expect(requests[1]).toMatchObject({
    path: "/auth/users/oauth/exchange", method: "POST", authenticated: false,
    body: { provider: "PASSKEY", challengeNo: challenge.challengeNo },
  });
  expect(requests[1].body).not.toHaveProperty("externalSubject");
});

test.each(["GOOGLE", "APPLE", "TELEGRAM"] as const)("%s goes directly to the configured provider exchange", async (provider) => {
  const requests: any[] = [];
  const api = createAuthApi({ request: async (value: any) => {
    requests.push(value);
    return response({ source: "provider" });
  } } as never,
    createSessionVault());

  await expect(api.oauthExchange({
    provider,
  })).resolves.toMatchObject({ source: "provider", sandbox: false });
  expect(requests).toHaveLength(1);
  expect(requests[0].body.provider).toBe(provider);
  expect(requests[0].body).not.toHaveProperty("challengeNo");
});

test("OAuth exchange rejects a response that attempts to masquerade as a Sandbox session", async () => {
  const api = createAuthApi({ request: async (request: any) => request.path.endsWith("/challenge")
    ? challenge
    : response({ source: "mock", sandbox: true }) } as never, createSessionVault());
  await expect(api.oauthExchange({
    provider: "PASSKEY",
  })).rejects.toThrow("OAUTH_RESPONSE_INVALID");
});

test("OAuth exchange rejects and does not persist a legacy phone-country session", async () => {
  const vault = createSessionVault();
  const api = createAuthApi({ request: async () => response({
    source: "provider",
    user: {
      userId: 8103,
      countryCode: "+1",
      phone: "4155552671",
      nickname: "Legacy User",
      onboardingComplete: true,
    },
  }) } as never, vault);

  await expect(api.oauthExchange({ provider: "GOOGLE" })).rejects.toThrow("OAUTH_RESPONSE_INVALID");
  expect(vault.read()).toBeNull();
});

test("a late OAuth response cannot overwrite a newer session epoch", async () => {
  let resolve: ((value: unknown) => void) | undefined;
  let markExchangeStarted: (() => void) | undefined;
  const exchangeStarted = new Promise<void>((done) => { markExchangeStarted = done; });
  const vault = createSessionVault();
  const api = createAuthApi({ request: async (request: any) => request.path.endsWith("/challenge")
    ? challenge
    : new Promise((done) => { resolve = done; markExchangeStarted?.(); }) } as never, vault);
  const pending = api.oauthExchange({
    provider: "PASSKEY",
  });
  await exchangeStarted;
  vault.save({
    accessToken: "new-access", refreshToken: "new-refresh", tokenType: "Bearer",
    user: { userId: 8102, countryCode: "+86", phone: "13800138001", nickname: "New", onboardingComplete: true },
  });
  resolve?.(response());
  await expect(pending).rejects.toThrow("SESSION_CHANGED_DURING_AUTH");
  expect(vault.read()?.user.userId).toBe(8102);
});
