export type RemoteLoginErrorKind =
  | "invalidCredentials"
  | "invalidPhone"
  | "otpInvalid"
  | "twoFactorInvalid"
  | "temporarilyLocked"
  | "accountBlocked"
  | "passwordResetRequired"
  | "signInStateChanged"
  | "serviceUnavailable";

export function resolveRemoteLoginErrorKind(code: string): RemoteLoginErrorKind {
  switch (code) {
    case "USER_CREDENTIAL_INVALID":
    case "USER_INVALID_CREDENTIALS":
      return "invalidCredentials";
    case "USER_TWO_FACTOR_CHALLENGE_INVALID":
    case "OTP_CODE_INVALID":
      return "twoFactorInvalid";
    case "USER_OTP_LOGIN_REQUEST_INVALID":
      return "invalidPhone";
    case "USER_OTP_LOGIN_CHALLENGE_INVALID":
      return "otpInvalid";
    case "USER_LOGIN_RATE_LIMITED":
    case "USER_LOGIN_TEMPORARILY_LOCKED":
    case "USER_OTP_SEND_RATE_LIMITED":
      return "temporarilyLocked";
    case "ACCOUNT_BLOCKLISTED":
      return "accountBlocked";
    case "USER_PASSWORD_RESET_REQUIRED":
      return "passwordResetRequired";
    case "USER_TWO_FACTOR_NOT_REQUIRED":
      return "signInStateChanged";
    default:
      return "serviceUnavailable";
  }
}
