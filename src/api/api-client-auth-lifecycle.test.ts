import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { createSessionVault } from "./session-vault";

describe("API client session lifecycle", () => {
  it("fails a protected prefetch locally when no session exists without evicting a later login", async () => {
    const request = vi.fn();
    const onUnauthorized = vi.fn();
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      vault: createSessionVault(),
      transport: { request },
      onUnauthorized,
    });

    await expect(api.request({ path: "/api/payout-addresses" }))
      .rejects.toThrow("AUTH_SESSION_REQUIRED");
    expect(request).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
