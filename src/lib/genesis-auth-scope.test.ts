import { describe, expect, it } from "vitest";
import { hasGenesisAuthorityForAccount } from "./genesis-auth-scope";

describe("Genesis remote authority scope", () => {
  it("rejects a missing access token", () => {
    expect(hasGenesisAuthorityForAccount(null, "user:42")).toBe(false);
    expect(hasGenesisAuthorityForAccount({ accessToken: "", user: { userId: 42 } }, "user:42")).toBe(false);
  });

  it("rejects a token issued for a different account", () => {
    expect(hasGenesisAuthorityForAccount({ accessToken: "token", user: { userId: 7 } }, "user:42")).toBe(false);
  });

  it("accepts only the active account's bearer session", () => {
    expect(hasGenesisAuthorityForAccount({ accessToken: "token", user: { userId: 42 } }, "USER:42")).toBe(true);
  });
});
