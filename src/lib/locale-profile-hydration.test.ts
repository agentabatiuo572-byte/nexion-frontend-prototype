import { describe, expect, it } from "vitest";
import { canHydrateProfileLocale } from "./locale-profile-hydration";

describe("profile locale hydration", () => {
  const first = { accountId: "user:42", revision: 3 };

  it("applies an account preference on a new device when no explicit choice exists", () => {
    expect(canHydrateProfileLocale(first, first, 0, 0)).toBe(true);
  });

  it("does not let an old account read overwrite a new account", () => {
    expect(canHydrateProfileLocale(first, { accountId: "user:99", revision: 4 }, 0, 0)).toBe(false);
  });

  it("keeps a quick explicit selection ahead of a late profile read", () => {
    expect(canHydrateProfileLocale(first, first, 3, 4)).toBe(false);
  });
});
