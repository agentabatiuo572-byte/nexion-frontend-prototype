import { beforeEach, describe, expect, it } from "vitest";
import { createMockAuthApi, changeMockAuthPassword, deleteMockAuthAccount, registerMockAuthCredential, setMockAuthTwoFactor } from "./mock-auth-api";
import { createSessionVault } from "./session-vault";

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

describe("mock auth security lifecycle", () => {
  const countryCode = "+1";
  const phone = "5551234567";
  const accountId = "+15551234567@demo.nexgrid.ai";

  it("validates the old password and persists the new credential", async () => {
    const api = createMockAuthApi(createSessionVault());
    registerMockAuthCredential(countryCode, phone, "OldPassword1");

    changeMockAuthPassword(accountId, "OldPassword1", "NewPassword1");
    await expect(api.login({ countryCode, phone, password: "OldPassword1" })).rejects.toMatchObject({ message: "USER_INVALID_CREDENTIALS" });
    await expect(api.login({ countryCode, phone, password: "NewPassword1" })).resolves.toMatchObject({ kind: "authenticated" });
  });

  it("issues and consumes a real mock 2FA login challenge", async () => {
    const api = createMockAuthApi(createSessionVault());
    registerMockAuthCredential(countryCode, phone, "OldPassword1");
    setMockAuthTwoFactor(accountId, true, "OldPassword1");

    const challenge = await api.login({ countryCode, phone, password: "OldPassword1" });
    expect(challenge).toMatchObject({ kind: "challenge" });
    if (challenge.kind !== "challenge") throw new Error("challenge expected");
    await expect(api.completeTwoFactor({ countryCode, phone, password: "OldPassword1", challengeNo: challenge.challengeNo, code: "123456" }))
      .resolves.toMatchObject({ kind: "authenticated" });
    await expect(api.completeTwoFactor({ countryCode, phone, password: "OldPassword1", challengeNo: challenge.challengeNo, code: "123456" }))
      .rejects.toMatchObject({ message: "USER_TWO_FACTOR_CHALLENGE_INVALID" });
  });

  it("deletes the mock account and prevents old credentials from logging in", async () => {
    const api = createMockAuthApi(createSessionVault());
    registerMockAuthCredential(countryCode, phone, "OldPassword1");
    storage.set("nexgrid-profile-accounts-v1", { [accountId]: { displayName: "A" }, other: { displayName: "B" } });
    storage.set("nexgrid-account-cloud-v1", { [accountId]: { accountKey: accountId }, other: { accountKey: "other" } });
    storage.set("nexgrid-auth-v1", { isAuthenticated: true, accountId });
    expect(deleteMockAuthAccount(accountId)).toBe(true);
    expect(storage.get("nexgrid-profile-accounts-v1")).toEqual({ other: { displayName: "B" } });
    expect(storage.get("nexgrid-account-cloud-v1")).toEqual({ other: { accountKey: "other" } });
    expect(storage.has("nexgrid-auth-v1")).toBe(false);
    await expect(api.login({ countryCode, phone, password: "OldPassword1" })).rejects.toMatchObject({ message: "USER_INVALID_CREDENTIALS" });
  });
});
