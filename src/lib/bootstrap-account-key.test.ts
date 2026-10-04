import { describe, expect, it } from "vitest";
import { resolveBootstrapAccountKey } from "./bootstrap-account-key";

describe("resolveBootstrapAccountKey", () => {
  it("uses the canonical remote session account even when local email is populated", () => {
    expect(resolveBootstrapAccountKey({
      remote: true,
      email: "member@example.test",
      accountId: "user:4242",
      sessionUserId: 4242,
    })).toBe("user:4242");
  });

  it("rejects a missing or mismatched remote session account", () => {
    expect(resolveBootstrapAccountKey({
      remote: true,
      email: "member@example.test",
      accountId: "user:4242",
      sessionUserId: undefined,
    })).toBeNull();
    expect(resolveBootstrapAccountKey({
      remote: true,
      email: "member@example.test",
      accountId: "user:4242",
      sessionUserId: 7777,
    })).toBeNull();
  });

  it("keeps email as the local-mode bootstrap preference", () => {
    expect(resolveBootstrapAccountKey({
      remote: false,
      email: "member@example.test",
      accountId: "user:4242",
      sessionUserId: 4242,
    })).toBe("member@example.test");
  });
});