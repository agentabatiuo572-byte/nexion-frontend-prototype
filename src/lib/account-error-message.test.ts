import { describe, expect, it } from "vitest";
import { accountErrorMessageKey } from "./account-error-message";

describe("account error presentation", () => {
  it.each([
    ["CURRENT_PASSWORD_INVALID", "currentPasswordInvalid"],
    ["USER_SECURITY_VERIFICATION_RATE_LIMITED", "securityVerificationRateLimited"],
    ["ACCOUNT_DELETION_VERSION_CONFLICT", "accountDeletionVersionConflict"],
    ["USER_AUTH_REQUIRED", "sessionUnavailable"],
    ["NOTIFICATION_PREFERENCES_UPDATE_FAILED", "updateFailed"],
    ["NETWORK_UNAVAILABLE", "unavailable"],
  ] as const)("maps %s to a user-facing key", (code, expected) => {
    expect(accountErrorMessageKey(code)).toBe(expected);
  });

  it("uses a safe generic key for an unknown machine code", () => {
    expect(accountErrorMessageKey("INTERNAL_ADMIN_SECRET_CODE")).toBe("unavailable");
  });
});
