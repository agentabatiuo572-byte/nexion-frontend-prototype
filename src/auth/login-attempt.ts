import { requireCryptoUuid } from "../lib/secure-command-id";
import { ApiError, isAmbiguousEnvelopeOutcome } from "../api/errors";
import type { KeyValueStorage } from "../api/session-vault";

export interface LoginAttempt {
  loginAttemptId: string;
  recoveryProof: string;
  installationId: string;
  executionSupported: boolean;
  authMethod: string;
  authReference: string;
  pending: boolean;
  context?: Record<string, string | null>;
}

/** Credentials/OTP never enter this record. The proof uses the encrypted native adapter. */
export function createLoginAttempt(deps: { storage?: KeyValueStorage; installationId: () => string; executionSupported: () => boolean }) {
  let current: LoginAttempt | null = null;
  function read() {
    if (current && current.installationId !== deps.installationId())
      throw new ApiError({ kind: "configuration", message: "LOGIN_INSTALLATION_CHANGED" });
    if (!current) {
      const saved = deps.storage?.get() as LoginAttempt | null;
      if (saved && /^[A-Za-z0-9_-]{16,80}$/.test(saved.loginAttemptId)
          && /^[A-Za-z0-9_-]{43,128}$/.test(saved.recoveryProof)
          && typeof saved.pending === "boolean") {
        if (saved.installationId !== deps.installationId())
          throw new ApiError({ kind: "configuration", message: "LOGIN_INSTALLATION_CHANGED" });
        current = saved;
      }
    }
    return current;
  }
  function save(value: LoginAttempt) { deps.storage?.set(value); current = value; }
  return {
    read,
    begin(authMethod: string, authReference: string, context: Record<string, string | null>, replay = false) {
      const old = read();
      if (old?.pending) {
        if (replay && old.authMethod === authMethod && old.authReference === authReference) return old;
        throw new ApiError({ kind: "configuration", message: "LOGIN_RESULT_UNKNOWN" });
      }
      if (replay) throw new ApiError({ kind: "configuration", message: "LOGIN_ATTEMPT_REQUIRED" });
      const continuation = (old?.authMethod === authMethod && old.authReference === authReference)
        || (old?.authMethod === "PASSWORD" && authMethod === "TWO_FACTOR"
          && old.context?.challengeNo === authReference
          && old.context?.countryCode === context.countryCode && old.context?.phone === context.phone);
      const attempt = { ...(continuation ? old : {
        loginAttemptId: requireCryptoUuid(), recoveryProof: (requireCryptoUuid() + requireCryptoUuid()).replace(/-/g, ""),
        installationId: deps.installationId(), executionSupported: deps.executionSupported(),
      }), authMethod, authReference, context, pending: true } as LoginAttempt;
      save(attempt);
      return attempt;
    },
    challenge(attempt: LoginAttempt, challengeNo?: string) {
      if (current?.loginAttemptId === attempt.loginAttemptId)
        save({ ...attempt, context: { ...attempt.context, ...(challengeNo ? { challengeNo } : {}) }, pending: false });
    },
    complete(attempt: LoginAttempt) { if (current?.loginAttemptId === attempt.loginAttemptId) { deps.storage?.remove(); current = null; } },
    cancelChallenge() {
      const attempt = read();
      if (attempt?.pending) throw new ApiError({ kind: "configuration", message: "LOGIN_RESULT_UNKNOWN" });
      if (attempt) { deps.storage?.remove(); current = null; }
    },
    failed(attempt: LoginAttempt, cause: unknown) {
      if (current?.loginAttemptId !== attempt.loginAttemptId) return;
      // These login replies are issued before session creation; a fresh attempt is safe.
      const rejectedBeforeLogin = cause instanceof ApiError
        && (cause.kind === "http" || cause.kind === "business")
        && (cause.status === 429 || cause.code === 429)
        && ["USER_LOGIN_RATE_LIMITED", "USER_LOGIN_TEMPORARILY_LOCKED"].includes(cause.message);
      if (!rejectedBeforeLogin && isAmbiguousEnvelopeOutcome(cause)) return;
      deps.storage?.remove(); current = null;
    },
  };
}
