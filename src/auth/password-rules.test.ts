import { describe, expect, it } from "vitest";
import { isResetPasswordOk } from "./password-rules";

describe("password reset policy", () => {
  it("matches the server reset policy", () => {
    expect(isResetPasswordOk("NewPassword2!", { phone: "9012345678" })).toBe(true);
    expect(isResetPasswordOk("Password2!", { phone: "9012345678" })).toBe(false);
    expect(isResetPasswordOk("newpassword2!", { phone: "9012345678" })).toBe(false);
    expect(isResetPasswordOk("NEWPASSWORD2!", { phone: "9012345678" })).toBe(false);
    expect(isResetPasswordOk("NewPassword!!", { phone: "9012345678" })).toBe(false);
    expect(isResetPasswordOk("NewPassword22", { phone: "9012345678" })).toBe(false);
  });
});
