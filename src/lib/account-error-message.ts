/**
 * Backend error identifiers are useful to telemetry but are never suitable
 * account-facing copy. Keep the mapping deliberately closed so a newly added
 * backend identifier fails safely to a recoverable generic message.
 */
export type AccountErrorMessageKey =
  | "currentPasswordInvalid"
  | "securityVerificationRateLimited"
  | "accountDeletionVersionConflict"
  | "sessionUnavailable"
  | "updateFailed"
  | "unavailable";

export function accountErrorMessageKey(cause: unknown): AccountErrorMessageKey {
  const code = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  switch (code) {
    case "CURRENT_PASSWORD_INVALID":
    case "USER_INVALID_CREDENTIALS":
      return "currentPasswordInvalid";
    case "USER_SECURITY_VERIFICATION_RATE_LIMITED":
      return "securityVerificationRateLimited";
    case "ACCOUNT_DELETION_VERSION_CONFLICT":
      return "accountDeletionVersionConflict";
    case "USER_AUTH_REQUIRED":
    case "USER_SESSION_REVOKED":
    case "SESSION_EXPIRED":
      return "sessionUnavailable";
    case "NOTIFICATION_PREFERENCES_UPDATE_FAILED":
      return "updateFailed";
    default:
      return "unavailable";
  }
}
