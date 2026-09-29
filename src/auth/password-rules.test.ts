import { describe, expect, it } from "vitest";
import { isPasswordOk, isResetPasswordOk } from "./password-rules";

describe("new password requirements", () => {
  it("requires an uppercase letter and a number without requiring lowercase or symbols", () => {
    expect(isPasswordOk("Orbit567")).toBe(true);
    expect(isPasswordOk("ORBIT567")).toBe(true);
    expect(isPasswordOk("orbit567")).toBe(false);
    expect(isPasswordOk("Orbitabc")).toBe(false);
  });

  it("retains length, weak-password and phone checks", () => {
    expect(isPasswordOk("Orbit56")).toBe(false);
    expect(isPasswordOk("Ab3d".repeat(16))).toBe(true);
    expect(isPasswordOk("Ab3d".repeat(16) + "X")).toBe(false);
    expect(isPasswordOk("Password1")).toBe(false);
    expect(isPasswordOk("Aaaaaa12")).toBe(true);
    expect(isPasswordOk("Aaaaaaa12")).toBe(false);
    expect(isPasswordOk("Orbit901234567", { phone: "901234567" })).toBe(false);
  });
});

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
