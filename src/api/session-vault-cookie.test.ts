import { describe, expect, it, vi } from "vitest";
import { createSessionVault } from "./session-vault";

describe("HttpOnly cookie session vault", () => {
  it("removes a persisted legacy session whose phone country is no longer supported", () => {
    const storage = {
      get: vi.fn(() => ({
        schema: 1,
        refreshToken: "legacy-refresh",
        tokenType: "Bearer",
        user: {
          userId: 3774,
          countryCode: "+1",
          phone: "4155552671",
          nickname: "Legacy User",
          onboardingComplete: true,
        },
      })),
      set: vi.fn(),
      remove: vi.fn(),
    };

    const vault = createSessionVault(storage);

    expect(vault.read()).toBeNull();
    expect(storage.remove).toHaveBeenCalledOnce();
  });

  it("keeps the access token in memory and persists no cookie credential marker", () => {
    const storage = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
    const vault = createSessionVault(storage);

    vault.save({
      accessToken: "memory-only-access",
      refreshToken: "",
      tokenType: "Bearer",
      user: { userId: 3775, countryCode: "+86", phone: "18708173775", nickname: "NexGrid 3775", onboardingComplete: true },
      refreshCredentialMode: "cookie",
    });

    expect(vault.read()?.accessToken).toBe("memory-only-access");
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledOnce();
  });
});
