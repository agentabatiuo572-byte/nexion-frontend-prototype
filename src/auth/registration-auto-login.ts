import type { AuthApi, LoginResult, RegistrationRequest } from "@/api/auth-api";
import { isRegistrationOutcomeUnknown } from "@/api/auth-api";
import { ApiError } from "@/api/errors";

type AuthenticatedLogin = Extract<LoginResult, { kind: "authenticated" }>;

export type RegistrationAutoLoginResult =
  | (AuthenticatedLogin & { registrationMayBeCommitted: true })
  | { kind: "registration_error"; error: unknown }
  | { kind: "login_error"; error: unknown; registrationMayBeCommitted: true }
  | { kind: "stale" };

/**
 * Register first, then authenticate through the ordinary password-login API.
 *
 * The current registration endpoint also returns a bootstrap session. That
 * session is consumed and revoked before password login so this flow cannot
 * leave two active sessions for one click. If the registration response is
 * outcome-unknown, password login doubles as the one safe authoritative read:
 * it succeeds only when the account was actually committed with this password.
 */
export async function registerAndLogin(
  authApi: AuthApi,
  request: RegistrationRequest,
  isCurrent: () => boolean,
): Promise<RegistrationAutoLoginResult> {
  let registrationReceipt: AuthenticatedLogin["registrationReceipt"] = null;
  try {
    const registration = await authApi.register(request);
    if (registration.kind !== "authenticated") {
      return {
        kind: "registration_error",
        error: new ApiError({ kind: "protocol", message: "REGISTRATION_SESSION_INVALID" }),
      };
    }
    registrationReceipt = registration.registrationReceipt ?? null;
    authApi.discardSessionIfCurrent(registration.vaultRevision);
  } catch (error) {
    if (!isRegistrationOutcomeUnknown(error)) {
      return { kind: "registration_error", error };
    }
  }

  if (!isCurrent()) return { kind: "stale" };

  try {
    const login = await authApi.login({
      countryCode: request.countryCode,
      phone: request.phone,
      password: request.password,
    });
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
