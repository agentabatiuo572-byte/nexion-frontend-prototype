import { describe, expect, it } from "vitest";
import { canRenderRegistrationSuccess } from "./registration-success-session";

describe("registration success identity fence", () => {
  it("admits the current authenticated server user only", () => {
    expect(canRenderRegistrationSuccess({
      remote: true, authenticated: true, accountId: "user:42", accessToken: "access", serverUserId: 42,
    })).toBe(true);
  });

  it("does not treat a gift receipt or an old account trace as identity", () => {
    expect(canRenderRegistrationSuccess({
      remote: true, authenticated: true, accountId: "user:42", accessToken: "", serverUserId: 42,
    })).toBe(false);
    expect(canRenderRegistrationSuccess({
      remote: true, authenticated: true, accountId: "user:42", accessToken: "access", serverUserId: 7,
    })).toBe(false);
  });
});
