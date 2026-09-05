import { beforeEach, describe, expect, it } from "vitest";
import { createMockAuthApi, setMockAuthTwoFactor } from "./mock-auth-api";
import { MOCK_PREVIEW_ACCOUNT, provisionMockPreviewAccount } from "./mock-preview-account";
import { createSessionVault } from "./session-vault";
import { resolveAuthAccount } from "@/store/auth-account";

const storage = new Map<string, unknown>();

beforeEach(() => {
  storage.clear();
  (globalThis as Record<string, unknown>).uni = {
    getStorageSync: (key: string) => storage.get(key) ?? "",
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  };
});

describe("fixed mock preview account", () => {
  it("creates one stable active account that can sign in without registration", async () => {
    const provisioned = provisionMockPreviewAccount();
    expect(provisioned).toEqual({ ok: true, accountId: "+84901234567@demo.nexgrid.ai" });
    expect(resolveAuthAccount(`${MOCK_PREVIEW_ACCOUNT.countryCode}${MOCK_PREVIEW_ACCOUNT.phone}`))
      .toMatchObject({
        ok: true,
        account: {
          accountId: "+84901234567@demo.nexgrid.ai",
          status: "active",
          onboardingComplete: true,
        },
      });

    const result = await createMockAuthApi(createSessionVault()).login(MOCK_PREVIEW_ACCOUNT);
    expect(result).toMatchObject({ kind: "authenticated" });
  });

  it("is idempotent and restores the known credential after mock security changes", async () => {
    const first = provisionMockPreviewAccount();
    if (!first.ok) throw new Error("preview account provision failed");
    setMockAuthTwoFactor(first.accountId, true, MOCK_PREVIEW_ACCOUNT.password);

    expect(provisionMockPreviewAccount()).toEqual(first);
    await expect(createMockAuthApi(createSessionVault()).login(MOCK_PREVIEW_ACCOUNT))
      .resolves.toMatchObject({ kind: "authenticated" });
  });

  it("repairs an obsolete local account directory instead of forcing registration again", async () => {
    storage.set("nexgrid-auth-accounts-v1", { schema: 1, users: {} });

    expect(provisionMockPreviewAccount()).toEqual({
      ok: true,
      accountId: "+84901234567@demo.nexgrid.ai",
    });
    await expect(createMockAuthApi(createSessionVault()).login(MOCK_PREVIEW_ACCOUNT))
      .resolves.toMatchObject({ kind: "authenticated" });
  });

  it("repairs a corrupt mock credential directory", async () => {
    storage.set("nexgrid-mock-auth-users-v1", { schema: 99, users: "broken" });

    expect(provisionMockPreviewAccount()).toMatchObject({ ok: true });
    await expect(createMockAuthApi(createSessionVault()).login(MOCK_PREVIEW_ACCOUNT))
      .resolves.toMatchObject({ kind: "authenticated" });
  });

  it("fails closed when credential storage is unavailable", () => {
    const originalUni = (globalThis as Record<string, unknown>).uni as Record<string, unknown>;
    (globalThis as Record<string, unknown>).uni = {
      ...originalUni,
      setStorageSync: (key: string, value: unknown) => {
        if (key === "nexgrid-mock-auth-users-v1") throw new Error("storage unavailable");
        storage.set(key, value);
      },
    };

    expect(provisionMockPreviewAccount()).toEqual({
      ok: false,
      error: "credential_storage_unavailable",
    });
  });
});
