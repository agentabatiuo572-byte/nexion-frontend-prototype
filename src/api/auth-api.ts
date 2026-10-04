import type { ApiClient } from "./api-client";
import { isRegistrationReceipt, isUserSession, type AuthSessionResponse, type RegistrationReceipt, type UserSession } from "./contracts";
import { ApiError, asApiError } from "./errors";
import type { RefreshCredentialMode, SessionSnapshot, SessionVault } from "./session-vault";
import { discardRotationNonce } from "./session-rotation-nonce";

export interface PasswordLoginRequest {
  countryCode: string;
  phone: string;
  password: string;
  /** Opaque server-issued/provider assertion used only when the OTP gate requests it. */
  captchaTicket?: string;
}

export interface TwoFactorLoginRequest extends PasswordLoginRequest {
  challengeNo: string;
  code: string;
}

export interface RegistrationOtpRequest {
  countryCode: string;
  phone: string;
  /** Opaque server-issued/provider assertion; never generated or signed by this client. */
  captchaTicket?: string;
}

export interface RegistrationOtpResult {
  challengeNo: string;
  resendAfterSec: number;
  deliveryHint: string;
}

export interface LoginOtpResult {
  challengeNo: string;
  resendAfterSec: number;
  deliveryHint: string;
}

export interface PasswordResetOtpResult {
  challengeNo: string;
  resendAfterSec: number;
  deliveryHint: string;
}

export interface RegistrationRequest extends RegistrationOtpRequest {
  challengeNo: string;
  code: string;
  password: string;
  sponsorCode: string | null;
  language?: string;
}

export type OAuthProvider = "GOOGLE" | "APPLE" | "PASSKEY" | "TELEGRAM";
export interface OAuthExchangeRequest {
  provider: OAuthProvider;
  displayName?: string;
}

export interface PasswordResetOtpVerifyResult {
  status: "PASSWORD_RESET_OTP_VERIFIED";
}
export interface OAuthExchangeResult {
  user: UserSession;
  vaultRevision: number;
  source: "development" | "provider";
  sandbox: false;
}

export type LoginResult =
  | { kind: "challenge"; user: UserSession; challengeNo: string; deliveryHint: string }
  | { kind: "authenticated"; user: UserSession; vaultRevision: number; registrationReceipt?: RegistrationReceipt | null };

export interface AuthApi {
  login(request: PasswordLoginRequest): Promise<LoginResult>;
  sendLoginOtp(request: RegistrationOtpRequest): Promise<LoginOtpResult>;
  completeOtpLogin(request: RegistrationOtpRequest & { challengeNo: string; code: string }): Promise<LoginResult>;
  sendPasswordResetOtp(request: RegistrationOtpRequest): Promise<PasswordResetOtpResult>;
  verifyPasswordResetOtp(request: RegistrationOtpRequest & {
    challengeNo: string;
    code: string;
  }): Promise<PasswordResetOtpVerifyResult>;
  completePasswordReset(request: RegistrationOtpRequest & {
    challengeNo: string;
    code: string;
    newPassword: string;
  }): Promise<{ status: "PASSWORD_RESET"; revokedSessionCount: number }>;
  completeTwoFactor(request: TwoFactorLoginRequest): Promise<LoginResult>;
  sendRegistrationOtp(request: RegistrationOtpRequest): Promise<RegistrationOtpResult>;
  verifyRegistrationOtp(request: RegistrationOtpRequest & {
    challengeNo: string;
    code: string;
  }): Promise<{ status: "REGISTRATION_OTP_VERIFIED" }>;
  register(request: RegistrationRequest): Promise<LoginResult>;
  oauthExchange(request: OAuthExchangeRequest): Promise<OAuthExchangeResult>;
  restore(): Promise<SessionSnapshot | null>;
  /** Consume only the exact vault epoch issued by a failed sign-in completion. */
  discardSessionIfCurrent(expectedRevision: number): void;
  /** Fallback for legacy callers: never consume a session owned by another user. */
  discardSessionForIdentity(identity: string): void;
  logout(): Promise<void>;
}

function loginOtpFromResponse(value: unknown): LoginOtpResult {
  if (!value || typeof value !== "object") {
    throw new ApiError({ kind: "protocol", message: "LOGIN_OTP_RESPONSE_INVALID" });
  }
  const data = value as Partial<LoginOtpResult>;
  if (
    typeof data.challengeNo !== "string"
    || !/^LOGIN-[a-f0-9]{32}$/i.test(data.challengeNo)
    || !Number.isSafeInteger(data.resendAfterSec)
    || Number(data.resendAfterSec) < 1
    || Number(data.resendAfterSec) > 600
    || typeof data.deliveryHint !== "string"
  ) {
    throw new ApiError({ kind: "protocol", message: "LOGIN_OTP_RESPONSE_INVALID" });
  }
  return data as LoginOtpResult;
}

function passwordResetOtpFromResponse(value: unknown): PasswordResetOtpResult {
  if (!value || typeof value !== "object") {
    throw new ApiError({ kind: "protocol", message: "PASSWORD_RESET_OTP_RESPONSE_INVALID" });
  }
  const data = value as Partial<PasswordResetOtpResult>;
  if (typeof data.challengeNo !== "string" || !/^RESET-[a-f0-9]{32}$/i.test(data.challengeNo)
      || !Number.isSafeInteger(data.resendAfterSec) || Number(data.resendAfterSec) < 1
      || Number(data.resendAfterSec) > 600 || typeof data.deliveryHint !== "string") {
    throw new ApiError({ kind: "protocol", message: "PASSWORD_RESET_OTP_RESPONSE_INVALID" });
  }
  return data as PasswordResetOtpResult;
}

/**
 * A registration POST can commit on the server while its response is lost.
 * Only transport loss, an unparseable response, and 5xx have that ambiguity;
 * authoritative 4xx responses remain actionable form errors.
 */
export function isRegistrationOutcomeUnknown(error: unknown): boolean {
  const apiError = asApiError(error);
  return apiError.kind === "network"
    || apiError.kind === "protocol"
    || (apiError.kind === "http" && (apiError.status ?? 0) >= 500);
}

function registrationOtpFromResponse(value: unknown): RegistrationOtpResult {
  if (!value || typeof value !== "object") {
    throw new ApiError({ kind: "protocol", message: "REGISTRATION_OTP_RESPONSE_INVALID" });
  }
  const data = value as Partial<RegistrationOtpResult>;
  if (
    typeof data.challengeNo !== "string"
    || !/^REG-[a-f0-9]{32}$/i.test(data.challengeNo)
    || !Number.isSafeInteger(data.resendAfterSec)
    || Number(data.resendAfterSec) < 1
    || Number(data.resendAfterSec) > 600
    || typeof data.deliveryHint !== "string"
  ) {
    throw new ApiError({ kind: "protocol", message: "REGISTRATION_OTP_RESPONSE_INVALID" });
  }
  return data as RegistrationOtpResult;
}

function sessionFromResponse(data: AuthSessionResponse, refreshCredentialMode: RefreshCredentialMode): SessionSnapshot | null {
  if (
    !data
    || typeof data !== "object"
    || typeof data.accessToken !== "string"
    || data.accessToken.length === 0
    || (refreshCredentialMode === "cookie"
      ? data.refreshToken !== null
      : typeof data.refreshToken !== "string" || data.refreshToken.length === 0)
    || typeof data.tokenType !== "string"
    || data.tokenType.toLowerCase() !== "bearer"
    || !isUserSession(data.user)
  ) return null;
  return {
    accessToken: data.accessToken,
    refreshToken: refreshCredentialMode === "cookie" ? "" : data.refreshToken as string,
    tokenType: data.tokenType,
    user: data.user,
    refreshCredentialMode,
    sessionSyncKey: typeof data.sessionSyncKey === "string" ? data.sessionSyncKey : undefined,
  };
}

function consumeLoginResponse(
  data: AuthSessionResponse,
  vault: SessionVault,
  expectedRevision: number,
  refreshCredentialMode: RefreshCredentialMode,
): LoginResult {
  if (
    data
    && typeof data === "object"
    && typeof data.tokenType === "string"
    && data.tokenType.toLowerCase() === "challenge"
    && data.accessToken === null
    && data.refreshToken === null
    && typeof data.challengeNo === "string"
    && data.challengeNo.length > 0
    && isUserSession(data.user)
  ) {
    return {
      kind: "challenge",
      user: data.user,
      challengeNo: data.challengeNo,
      deliveryHint: data.deliveryHint || "",
    };
  }
  const session = sessionFromResponse(data, refreshCredentialMode);
  if (!session) throw new ApiError({ kind: "protocol", message: "AUTH_RESPONSE_INVALID" });
  const registrationReceipt = data.registrationReceipt ?? null;
  if (registrationReceipt !== null && !isRegistrationReceipt(registrationReceipt)) {
    throw new ApiError({ kind: "protocol", message: "AUTH_REGISTRATION_RECEIPT_INVALID" });
  }
  if (!vault.saveIfUnchanged(session, expectedRevision)) {
    throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_AUTH" });
  }
  if (refreshCredentialMode === "cookie") discardRotationNonce();
  // saveIfUnchanged advances the vault exactly once. Returning that epoch lets
  // the UI discard this issuance without ever clearing a later account's vault.
  return { kind: "authenticated", user: session.user, vaultRevision: expectedRevision + 1, registrationReceipt };
}

function oauthExchangeFromResponse(
  value: unknown,
  vault: SessionVault,
  expectedRevision: number,
  refreshCredentialMode: RefreshCredentialMode,
): OAuthExchangeResult {
  if (!value || typeof value !== "object") {
    throw new ApiError({ kind: "protocol", message: "OAUTH_RESPONSE_INVALID" });
  }
  const data = value as Record<string, unknown>;
  if (typeof data.accessToken !== "string" || data.accessToken.length === 0
      || (refreshCredentialMode === "cookie"
        ? data.refreshToken !== null
        : typeof data.refreshToken !== "string" || data.refreshToken.length === 0)
      || data.tokenType !== "Bearer" || !isUserSession(data.user)
      || (data.source !== "development" && data.source !== "provider") || data.sandbox !== false) {
    throw new ApiError({ kind: "protocol", message: "OAUTH_RESPONSE_INVALID" });
  }
  const session: SessionSnapshot = {
    accessToken: data.accessToken,
    refreshToken: refreshCredentialMode === "cookie" ? "" : data.refreshToken as string,
    tokenType: data.tokenType,
    user: data.user,
    refreshCredentialMode,
    sessionSyncKey: typeof data.sessionSyncKey === "string" ? data.sessionSyncKey : undefined,
  };
  if (!vault.saveIfUnchanged(session, expectedRevision)) {
    throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_AUTH" });
  }
  if (refreshCredentialMode === "cookie") discardRotationNonce();
  return {
    user: data.user,
    vaultRevision: expectedRevision + 1,
    source: data.source as "development" | "provider",
    sandbox: false,
  };
}

function passwordResetOtpVerifyFromResponse(value: unknown): PasswordResetOtpVerifyResult {
  if (!value || typeof value !== "object"
      || (value as Record<string, unknown>).status !== "PASSWORD_RESET_OTP_VERIFIED") {
    throw new ApiError({ kind: "protocol", message: "PASSWORD_RESET_OTP_VERIFY_RESPONSE_INVALID" });
  }
  return { status: "PASSWORD_RESET_OTP_VERIFIED" };
}

function oauthDevelopmentChallengeFromResponse(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new ApiError({ kind: "protocol", message: "OAUTH_DEVELOPMENT_CHALLENGE_INVALID" });
  }
  const data = value as Record<string, unknown>;
  if (typeof data.challengeNo !== "string" || !/^OAUTH-[a-f0-9]{32}$/.test(data.challengeNo)
      || !Number.isSafeInteger(data.expiresInSec) || Number(data.expiresInSec) < 1
      || Number(data.expiresInSec) > 600) {
    throw new ApiError({ kind: "protocol", message: "OAUTH_DEVELOPMENT_CHALLENGE_INVALID" });
  }
  return data.challengeNo;
}

export function createAuthApi(
  client: ApiClient,
  vault: SessionVault,
  options: { refreshCredentialMode?: RefreshCredentialMode; clientSurface?: "APP" } = {},
): AuthApi {
  const refreshCredentialMode = options.refreshCredentialMode ?? "token";
  let restoreInFlight: Promise<SessionSnapshot | null> | null = null;
  const cookieHeaders = refreshCredentialMode === "cookie"
    ? { "X-Nexion-Refresh-Mode": "cookie" }
    : undefined;
  const sessionIssuanceHeaders = options.clientSurface === "APP"
    ? { ...cookieHeaders, "X-NexGrid-Client-Surface": "APP" }
    : cookieHeaders;
  const revokeRefreshTokenBestEffort = (refreshToken: string) => {
    void client.request({
      path: "/auth/users/logout",
      method: "POST",
      ...(refreshCredentialMode === "token" ? { body: { refreshToken } } : {}),
      ...(cookieHeaders ? { headers: cookieHeaders } : {}),
      authenticated: false,
    }).catch(() => {
      // The local vault was already consumed. Server revocation is best-effort.
    });
  };
  const discardSessionIfCurrent = (expectedRevision: number): void => {
    if (vault.revision() !== expectedRevision) return;
    const snapshot = vault.read();
    if (!snapshot) return;
    // Clear synchronously before the network request so a rejected completion
    // cannot leave a hidden Bearer token available to background requests.
    if (!vault.clearIfUnchanged(expectedRevision)) return;
    revokeRefreshTokenBestEffort(snapshot.refreshToken);
  };
  const discardSessionForIdentity = (identity: string): void => {
    const expectedRevision = vault.revision();
    const snapshot = vault.read();
    if (!snapshot) return;
    if (`user:${snapshot.user.userId}` !== identity) return;
    discardSessionIfCurrent(expectedRevision);
  };
  return {
    async login(request) {
      // Set-Cookie from a bootstrap restore must settle before a new login.
      // Do not initiate a refresh merely because the user pressed Sign in.
      if (restoreInFlight) await restoreInFlight;
      const revision = vault.revision();
      const data = await client.request<AuthSessionResponse>({
        path: "/auth/users/login",
        method: "POST",
        body: request,
        authenticated: false,
        ...(sessionIssuanceHeaders ? { headers: sessionIssuanceHeaders } : {}),
        acceptedResponses: [{
          status: 428,
          code: 428,
          message: "USER_TWO_FACTOR_VERIFICATION_REQUIRED",
        }],
      });
      return consumeLoginResponse(data, vault, revision, refreshCredentialMode);
    },
    async sendLoginOtp(request) {
      return loginOtpFromResponse(await client.request<unknown>({
        path: "/auth/users/login/otp/send",
        method: "POST",
        body: request,
        authenticated: false,
      }));
    },
    async completeOtpLogin(request) {
      const revision = vault.revision();
      const data = await client.request<AuthSessionResponse>({
        path: "/auth/users/login/otp/verify",
        method: "POST",
        body: request,
        authenticated: false,
        ...(sessionIssuanceHeaders ? { headers: sessionIssuanceHeaders } : {}),
      });
      const result = consumeLoginResponse(data, vault, revision, refreshCredentialMode);
      if (result.kind !== "authenticated") {
        throw new ApiError({ kind: "protocol", message: "LOGIN_OTP_SESSION_INVALID" });
      }
      return result;
    },
    async sendPasswordResetOtp(request) {
      return passwordResetOtpFromResponse(await client.request<unknown>({
        path: "/auth/users/password-reset/otp/send",
        method: "POST",
        body: request,
        authenticated: false,
      }));
    },
    async verifyPasswordResetOtp(request) {
      return passwordResetOtpVerifyFromResponse(await client.request<unknown>({
        path: "/auth/users/password-reset/otp/verify",
        method: "POST",
        body: request,
        authenticated: false,
      }));
    },
    async completePasswordReset(request) {
      const data = await client.request<unknown>({
        path: "/auth/users/password-reset/otp/complete",
        method: "POST",
        body: request,
        authenticated: false,
      });
      if (!data || typeof data !== "object") {
        throw new ApiError({ kind: "protocol", message: "PASSWORD_RESET_RESPONSE_INVALID" });
      }
      const row = data as Record<string, unknown>;
      if (row.status !== "PASSWORD_RESET" || !Number.isSafeInteger(row.revokedSessionCount)
          || Number(row.revokedSessionCount) < 0) {
        throw new ApiError({ kind: "protocol", message: "PASSWORD_RESET_RESPONSE_INVALID" });
      }
      return { status: "PASSWORD_RESET", revokedSessionCount: Number(row.revokedSessionCount) };
    },
    async completeTwoFactor(request) {
      const revision = vault.revision();
      const data = await client.request<AuthSessionResponse>({
        path: "/auth/users/login/2fa",
        method: "POST",
        body: request,
        authenticated: false,
        ...(sessionIssuanceHeaders ? { headers: sessionIssuanceHeaders } : {}),
      });
      return consumeLoginResponse(data, vault, revision, refreshCredentialMode);
    },
    async sendRegistrationOtp(request) {
      const data = await client.request<unknown>({
        path: "/auth/users/register/otp/send",
        method: "POST",
        body: request,
        authenticated: false,
      });
      return registrationOtpFromResponse(data);
    },
    async verifyRegistrationOtp(request) {
      const data = await client.request<unknown>({
        path: "/auth/users/register/otp/verify",
        method: "POST",
        body: request,
        authenticated: false,
      });
      if (!data || typeof data !== "object"
          || (data as Record<string, unknown>).status !== "REGISTRATION_OTP_VERIFIED") {
        throw new ApiError({ kind: "protocol", message: "REGISTRATION_OTP_VERIFY_RESPONSE_INVALID" });
      }
      return { status: "REGISTRATION_OTP_VERIFIED" };
    },
    async register(request) {
      const revision = vault.revision();
      const data = await client.request<AuthSessionResponse>({
        path: "/auth/users/register",
        method: "POST",
        body: request,
        authenticated: false,
        ...(sessionIssuanceHeaders ? { headers: sessionIssuanceHeaders } : {}),
      });
      const result = consumeLoginResponse(data, vault, revision, refreshCredentialMode);
      if (result.kind !== "authenticated") {
        throw new ApiError({ kind: "protocol", message: "REGISTRATION_SESSION_INVALID" });
      }
      return result;
    },
    async oauthExchange(request) {
      const revision = vault.revision();
      // Only the local development Passkey uses a server-issued one-time
      // challenge. Real providers go directly to their configured adapter.
      const challengeNo = request.provider === "PASSKEY"
        ? oauthDevelopmentChallengeFromResponse(await client.request<unknown>({
          path: "/auth/users/oauth/development/passkey/challenge",
          method: "POST",
          body: { provider: request.provider },
          authenticated: false,
        }))
        : undefined;
      const body = {
        provider: request.provider,
        displayName: request.displayName,
        ...(challengeNo ? { challengeNo } : {}),
      };
      const data = await client.request<unknown>({
        path: "/auth/users/oauth/exchange",
        method: "POST",
        body,
        authenticated: false,
        ...(sessionIssuanceHeaders ? { headers: sessionIssuanceHeaders } : {}),
      });
      return oauthExchangeFromResponse(data, vault, revision, refreshCredentialMode);
    },
    restore() {
      if (refreshCredentialMode === "token" && !vault.read()?.refreshToken) return Promise.resolve(null);
      if (!restoreInFlight) {
        // Bootstrap and ordinary token renewal share one rotation request.
        restoreInFlight = client.refreshSession().catch((error: unknown) => {
          // Only an authoritative rejection means that no session can be
          // restored. Transport/protocol failures must remain retryable, and
          // a rejected older request cannot invalidate a newer login.
          if (error instanceof ApiError
              && (error.kind === "auth" || error.status === 401 || error.status === 403)
              && error.message !== "SESSION_CHANGED_DURING_REFRESH"
              && !vault.read()) {
            discardRotationNonce();
            return null;
          }
          throw error;
        }).finally(() => {
          restoreInFlight = null;
        });
      }
      return restoreInFlight;
    },
    discardSessionIfCurrent(expectedRevision) {
      discardSessionIfCurrent(expectedRevision);
    },
    discardSessionForIdentity(identity) {
      discardSessionForIdentity(identity);
    },
    async logout() {
      const revision = vault.revision();
      const refreshToken = vault.read()?.refreshToken;
      try {
        if (refreshCredentialMode === "cookie" || refreshToken) {
          await client.request({
            path: "/auth/users/logout",
            method: "POST",
            ...(refreshCredentialMode === "token" ? { body: { refreshToken } } : {}),
            ...(cookieHeaders ? { headers: cookieHeaders } : {}),
            authenticated: false,
          });
        }
      } catch {
        // Local logout is authoritative for this device even when offline.
      } finally {
        // A rotation continues the chain being signed out; a new login starts
        // a different identity revision and must retain its own session.
        vault.clearIfUnchanged(vault.isRefreshContinuation(revision) ? vault.revision() : revision);
        if (refreshCredentialMode === "cookie") discardRotationNonce();
      }
    },
  };
}
