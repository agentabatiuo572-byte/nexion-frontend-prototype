import { describe, expect, it } from "vitest";
import { resolveRemoteLoginErrorKind } from "./remote-login-error";

describe("remote login error mapping", () => {
  it("maps the backend canonical credential code to invalid credentials", () => {
    expect(resolveRemoteLoginErrorKind("USER_CREDENTIAL_INVALID")).toBe("invalidCredentials");
  });

  it("keeps compatibility with the legacy frontend and mock credential code", () => {
    expect(resolveRemoteLoginErrorKind("USER_INVALID_CREDENTIALS")).toBe("invalidCredentials");
  });

  it("distinguishes the current backend account states from a service outage", () => {
    expect(resolveRemoteLoginErrorKind("USER_LOGIN_RATE_LIMITED")).toBe("temporarilyLocked");
    expect(resolveRemoteLoginErrorKind("USER_LOGIN_TEMPORARILY_LOCKED")).toBe("temporarilyLocked");
    expect(resolveRemoteLoginErrorKind("USER_OTP_SEND_RATE_LIMITED")).toBe("temporarilyLocked");
    expect(resolveRemoteLoginErrorKind("ACCOUNT_BLOCKLISTED")).toBe("accountBlocked");
    expect(resolveRemoteLoginErrorKind("USER_PASSWORD_RESET_REQUIRED")).toBe("passwordResetRequired");
  });

  it("maps OTP validation and stale two-factor state without claiming a service outage", () => {
    expect(resolveRemoteLoginErrorKind("USER_OTP_LOGIN_REQUEST_INVALID")).toBe("invalidPhone");
    expect(resolveRemoteLoginErrorKind("USER_OTP_LOGIN_CHALLENGE_INVALID")).toBe("otpInvalid");
    expect(resolveRemoteLoginErrorKind("USER_TWO_FACTOR_CHALLENGE_INVALID")).toBe("twoFactorInvalid");
    expect(resolveRemoteLoginErrorKind("OTP_CODE_INVALID")).toBe("twoFactorInvalid");
    expect(resolveRemoteLoginErrorKind("USER_TWO_FACTOR_NOT_REQUIRED")).toBe("signInStateChanged");
  });

  it("preserves true unavailable fallbacks", () => {
    expect(resolveRemoteLoginErrorKind("USER_AUTH_ENVIRONMENT_FORBIDDEN")).toBe("serviceUnavailable");
    expect(resolveRemoteLoginErrorKind("UNRECOGNIZED_LOGIN_FAILURE")).toBe("serviceUnavailable");
    expect(resolveRemoteLoginErrorKind("")).toBe("serviceUnavailable");
  });
});
