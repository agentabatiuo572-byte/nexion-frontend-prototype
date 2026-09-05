import { expect, test } from "vitest";
import { createAuthApi } from "./auth-api";
import { createSessionVault } from "./session-vault";

const response = (overrides: Record<string, unknown> = {}) => ({
  accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
  user: { userId: 8101, countryCode: "+1", phone: "900123456789", nickname: "Google Sandbox" },
  source: "mock", sandbox: true, ...overrides,
});

const challenge = { challengeNo: "OAUTH-11111111111111111111111111111111", expiresInSec: 300 };

test("OAuth exchange consumes a server-issued one-time Sandbox challenge", async () => {
  const requests: any[] = [];
  const api = createAuthApi({
    request: async (value: any) => {
      requests.push(value);
      return value.path.endsWith("/challenge") ? challenge : response();
    },
  } as never, createSessionVault());

  await expect(api.oauthExchange({
    provider: "GOOGLE", mode: "SANDBOX_MOCK",
  })).resolves.toMatchObject({ source: "mock", sandbox: true, user: { userId: 8101 } });
  expect(requests[0]).toMatchObject({
    path: "/auth/users/oauth/sandbox/challenge", method: "POST", authenticated: false,
    body: { provider: "GOOGLE" },
  });
  expect(requests[1]).toMatchObject({
    path: "/auth/users/oauth/exchange", method: "POST", authenticated: false,
    body: { provider: "GOOGLE", mode: "SANDBOX_MOCK", challengeNo: challenge.challengeNo },
  });
  expect(requests[1].body).not.toHaveProperty("externalSubject");
});

test.each(["PASSKEY", "TELEGRAM"] as const)("%s uses the same explicit isolated sandbox exchange", async (provider) => {
  const requests: any[] = [];
  const api = createAuthApi({ request: async (value: any) => {
    requests.push(value);
    return value.path.endsWith("/challenge") ? challenge : response();
  } } as never,
    createSessionVault());

  await expect(api.oauthExchange({
    provider, mode: "SANDBOX_MOCK",
  })).resolves.toMatchObject({ source: "mock", sandbox: true });
  expect(requests[0].body.provider).toBe(provider);
  expect(requests[1].body.provider).toBe(provider);
});

test("OAuth exchange rejects a response that attempts to masquerade as a provider session", async () => {
  const api = createAuthApi({ request: async () => response({ source: "provider", sandbox: false }) } as never, createSessionVault());
  await expect(api.oauthExchange({
    provider: "APPLE", mode: "PROVIDER", externalSubject: "provider-subject",
  })).rejects.toThrow("OAUTH_RESPONSE_INVALID");
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
    provider: "GOOGLE", mode: "SANDBOX_MOCK",
  });
  await exchangeStarted;
  vault.save({
    accessToken: "new-access", refreshToken: "new-refresh", tokenType: "Bearer",
    user: { userId: 8102, countryCode: "+1", phone: "900999999999", nickname: "New" },
  });
  resolve?.(response());
  await expect(pending).rejects.toThrow("SESSION_CHANGED_DURING_AUTH");
  expect(vault.read()?.user.userId).toBe(8102);
});
