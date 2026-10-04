import { asApiError, type ApiErrorKind } from "@/api/errors";

export type AchievementRemoteReadFailure =
  | "SESSION_RESTORE_TIMEOUT"
  | "AUTH"
  | "NETWORK"
  | "SERVER"
  | "PROTOCOL"
  | "BUSINESS"
  | "CONFIGURATION";

export type AchievementRemoteReadResult<T> =
  | { kind: "success"; snapshot: T }
  | { kind: "stale" }
  | { kind: "failure"; failure: AchievementRemoteReadFailure };

interface RemoteSession {
  accessToken: string;
  user: { userId: number };
}

export interface AchievementRemoteReadOptions<T> {
  accountKey: () => string;
  session: () => RemoteSession | null;
  isCurrent: () => boolean;
  read: () => Promise<T>;
  wait?: (milliseconds: number) => Promise<void>;
  waitAttempts?: number;
  waitMilliseconds?: number;
}

const DEFAULT_WAIT_ATTEMPTS = 24;
const DEFAULT_WAIT_MILLISECONDS = 500;

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasMatchingSession(session: RemoteSession | null, accountKey: string): boolean {
  return !!session?.accessToken && accountKey === `user:${session.user.userId}`;
}

function safeFailureKind(kind: ApiErrorKind): AchievementRemoteReadFailure {
  switch (kind) {
    case "auth": return "AUTH";
    case "network": return "NETWORK";
    case "http": return "SERVER";
    case "protocol": return "PROTOCOL";
    case "business": return "BUSINESS";
    case "configuration": return "CONFIGURATION";
  }
}

/**
 * A page entered during H5 cold restore has no in-memory bearer yet.  Do not
 * turn that local precondition into a server-unavailable state: wait for the
 * app-level restore to bind the same server subject, then make exactly one
 * read.  The bounded wait preserves a real retryable error when restore never
 * completes, and the caller's generation fence cancels switched accounts.
 */
export async function readAchievementsForCurrentSession<T>(
  options: AchievementRemoteReadOptions<T>,
): Promise<AchievementRemoteReadResult<T>> {
  const wait = options.wait ?? pause;
  const attempts = Math.max(0, options.waitAttempts ?? DEFAULT_WAIT_ATTEMPTS);
  const milliseconds = Math.max(0, options.waitMilliseconds ?? DEFAULT_WAIT_MILLISECONDS);

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    if (!options.isCurrent()) return { kind: "stale" };
    if (hasMatchingSession(options.session(), options.accountKey())) break;
    if (attempt === attempts) {
      return { kind: "failure", failure: "SESSION_RESTORE_TIMEOUT" };
    }
    await wait(milliseconds);
  }

  if (!options.isCurrent()) return { kind: "stale" };
  if (!hasMatchingSession(options.session(), options.accountKey())) {
    return { kind: "failure", failure: "SESSION_RESTORE_TIMEOUT" };
  }

  try {
    const snapshot = await options.read();
    return options.isCurrent() ? { kind: "success", snapshot } : { kind: "stale" };
  } catch (error) {
    return options.isCurrent()
      ? { kind: "failure", failure: safeFailureKind(asApiError(error).kind) }
      : { kind: "stale" };
  }
}
