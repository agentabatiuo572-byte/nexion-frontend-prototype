import type { AuthApi, LoginResult, RegistrationRequest } from "@/api/auth-api";
import { isRegistrationOutcomeUnknown } from "@/api/auth-api";
import { ApiError } from "@/api/errors";

type AuthenticatedLogin = Extract<LoginResult, { kind: "authenticated" }>;

export type RegistrationAutoLoginResult =
  | (AuthenticatedLogin & { registrationMayBeCommitted: true })
  | { kind: "registration_error"; error: unknown }
  | { kind: "login_error"; error: unknown; registrationMayBeCommitted: true }
  | { kind: "recovery_required" }
  | { kind: "stale" };

/** A different form must not adopt the account from a previously pending login. */
export function requiresOriginalRegistrationRecovery(authApi: AuthApi, identity: Pick<RegistrationRequest, "countryCode" | "phone">): boolean {
  if (!authApi.pendingLogin()) return false;
  const attempt = authApi.pendingLoginContext();
  return attempt?.authMethod !== "REGISTRATION"
    || attempt.context.countryCode !== identity.countryCode || attempt.context.phone !== identity.phone;
}

/**
 * Registration returns its authoritative session directly. An unknown result
 * is recovered by its original attempt and proof, without issuing another login.
 */
export async function registerAndLogin(
  authApi: AuthApi,
  request: RegistrationRequest,
  isCurrent: () => boolean,
  recoverOnly = false,
): Promise<RegistrationAutoLoginResult> {
  if (requiresOriginalRegistrationRecovery(authApi, request)) return { kind: "recovery_required" };
  // Re-entering the original identity may query its result, never POST again.
  recoverOnly ||= authApi.pendingLogin();
  let registrationReceipt: AuthenticatedLogin["registrationReceipt"] = null;
  if (!recoverOnly) try {
    const registration = await authApi.register(request);
    if (registration.kind !== "authenticated") {
      return {
        kind: "registration_error",
        error: new ApiError({ kind: "protocol", message: "REGISTRATION_SESSION_INVALID" }),
      };
    }
    if (!isCurrent()) {
      authApi.discardSessionIfCurrent(registration.vaultRevision);
      return { kind: "stale" };
    }
    return {
      ...registration,
      registrationReceipt: registration.registrationReceipt ?? null,
      registrationMayBeCommitted: true,
    };
  } catch (error) {
    if (!isRegistrationOutcomeUnknown(error)) {
      return { kind: "registration_error", error };
    }
  }

  if (!isCurrent()) return { kind: "stale" };
  if (requiresOriginalRegistrationRecovery(authApi, request)) return { kind: "recovery_required" };

  try {
    const login = await authApi.recoverLogin();
    if (!isCurrent()) {
      if (login.kind === "authenticated") {
        authApi.discardSessionIfCurrent(login.vaultRevision);
      }
      return { kind: "stale" };
    }
    if (login.kind !== "authenticated") {
      return {
        kind: "login_error",
        error: new ApiError({ kind: "protocol", message: "REGISTRATION_AUTO_LOGIN_CHALLENGE_UNEXPECTED" }),
        registrationMayBeCommitted: true,
      };
    }
    return { ...login, registrationReceipt: registrationReceipt ?? login.registrationReceipt ?? null, registrationMayBeCommitted: true };
  } catch (error) {
    return { kind: "login_error", error, registrationMayBeCommitted: true };
  }
}
