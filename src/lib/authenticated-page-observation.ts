import type { RemoteAccountRequest } from "./remote-account-epoch";

export interface ObservationSession {
  accessToken: string;
  user: { userId: number };
}

export interface AuthenticatedPageObservation<Result = void> {
  subject: string;
  scope: RemoteAccountRequest;
  session: ObservationSession | null | undefined;
  visible(): boolean;
  isCurrent(scope: RemoteAccountRequest): boolean;
  submit(): Promise<Result>;
  /** A resolved transport can still be a server-owned no-op. */
  accepted?(result: Result): boolean;
}

export interface AuthenticatedPageObservationOptions {
  /** Only suppresses duplicate transport attempts; the server owns completion. */
  now?: () => number;
  successTtlMs?: number;
  failureCooldownMs?: number;
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const SUCCESS_TTL_MS = 8 * DAY_MS;
const FAILURE_COOLDOWN_MS = 30 * 1_000;

type ObservationAttempt = {
  state: "pending" | "accepted" | "failed";
  at: number;
};

function boundedDuration(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * This is a client-side transport-suppression key only. It is never sent to
 * the service and cannot grant a reward; the service remains authoritative
 * for the Asia/Shanghai week and its deduplication decision.
 */
export function shanghaiIsoWeekKey(timestamp: number): string {
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS);
  // ISO weeks are calendar-day based. Keeping the shifted time-of-day would
  // make the first Thursday of an ISO year round into the following week.
  date.setUTCHours(0, 0, 0, 0);
  const isoDay = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - isoDay);
  const isoYear = date.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `WEEK:${isoYear}-W${String(week).padStart(2, "0")}`;
}

function hasMatchingUserSession(
  session: ObservationSession | null | undefined,
  scope: RemoteAccountRequest,
): boolean {
  return !!session?.accessToken?.trim()
    && Number.isSafeInteger(session.user?.userId)
    && session.user.userId > 0
    && scope.accountKey.trim().toLowerCase() === `user:${session.user.userId}`;
}

/**
 * A fire-and-forget observer. It deliberately records attempts before POSTing:
 * browsing telemetry must never retry-loop or alter page UI.
 */
export function createAuthenticatedPageObservationReporter(options: AuthenticatedPageObservationOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const successTtlMs = boundedDuration(options.successTtlMs, SUCCESS_TTL_MS);
  const failureCooldownMs = boundedDuration(options.failureCooldownMs, FAILURE_COOLDOWN_MS);
  const attempted = new Map<string, ObservationAttempt>();

  function elapsedSince(at: number, current: number): number {
    return Math.max(0, current - at);
  }

  function prune(current: number): void {
    for (const [key, attempt] of attempted) {
      const ttl = attempt.state === "failed" ? failureCooldownMs : successTtlMs;
      if (attempt.state !== "pending" && elapsedSince(attempt.at, current) >= ttl) attempted.delete(key);
    }
  }

  async function report<Result>(input: AuthenticatedPageObservation<Result>): Promise<void> {
    if (!input.visible() || !input.isCurrent(input.scope) || !hasMatchingUserSession(input.session, input.scope)) return;
    const current = now();
    prune(current);
    const key = `${input.scope.accountKey}:${input.scope.epoch}:${shanghaiIsoWeekKey(current)}:${input.subject}`;
    const previous = attempted.get(key);
    if (
      previous?.state === "pending"
      || (previous?.state === "accepted" && elapsedSince(previous.at, current) < successTtlMs)
      || (previous?.state === "failed" && elapsedSince(previous.at, current) < failureCooldownMs)
    ) return;
    attempted.set(key, { state: "pending", at: current });
    try {
      const result = await input.submit();
      attempted.set(key, { state: input.accepted?.(result) === false ? "failed" : "accepted", at: now() });
    } catch {
      // Observation availability never changes a successfully rendered page.
      attempted.set(key, { state: "failed", at: now() });
    }
  }

  return { report };
}

// One app-runtime reporter also covers a page instance recreated by navigation.
// Its account epoch and client-side period key prevent scope reuse. A local
// clock only limits request frequency; it never changes server task state.
export const authenticatedPageObservationReporter = createAuthenticatedPageObservationReporter();
