import { afterEach, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { createSessionVault } from "./session-vault";

afterEach(() => vi.unstubAllGlobals());

it("accepts a secure API endpoint when the native service has no URL global", async () => {
  vi.stubGlobal("URL", undefined);
  const request = vi.fn().mockResolvedValue({
    status: 200, data: { code: 0, message: "success", data: { ready: true } }, headers: {},
  });
  const api = createApiClient({
    baseUrl: "https://18.142.169.24/",
    vault: createSessionVault(),
    transport: { request },
    allowInsecureHttp: false,
  });

  await expect(api.request({ path: "/api/ready", authenticated: false })).resolves.toEqual({ ready: true });
  expect(request.mock.calls[0][0].url).toBe("https://18.142.169.24/api/ready");
  expect(() => createApiClient({ baseUrl: "http://example.com", vault: createSessionVault(),
    transport: { request }, allowInsecureHttp: false })).toThrow("API_HTTPS_REQUIRED");
  expect(() => createApiClient({ baseUrl: "https://", vault: createSessionVault(),
    transport: { request } })).toThrow("API_BASE_URL_INVALID");
  expect(() => createApiClient({ baseUrl: "https://api.example.com:99999", vault: createSessionVault(),
    transport: { request } })).toThrow("API_BASE_URL_INVALID");
  expect(() => createApiClient({ baseUrl: "https://user@api.example.com", vault: createSessionVault(),
    transport: { request } })).toThrow("API_BASE_URL_INVALID");
});
