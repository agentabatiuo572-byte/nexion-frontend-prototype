const DAY_MS = 86_400_000;

export function hasMonotonicClock(): boolean {
  return typeof performance !== "undefined" && typeof performance.now === "function";
}

/** A remote deadline must never substitute the device wall clock. */
export function readTrustedMonotonicNowMs(): number | null {
  try {
    if (!hasMonotonicClock()) return null;
    const now = performance.now();
    return Number.isFinite(now) && now >= 0 ? now : null;
  } catch {
    return null;
  }
}

export function readMonotonicNowMs(): number {
  if (hasMonotonicClock()) {
    return performance.now();
  }
  return Date.now();
}

export function advanceMonotonicHighWater(previous: number, candidate: number): number {
  if (!Number.isFinite(candidate) || candidate < 0) return previous;
  return Math.max(previous, candidate);
}

export function projectServerNow(
  serverNow: number,
  receivedMonotonicAt: number,
  currentMonotonicAt: number,
): number {
  return serverNow + Math.max(0, currentMonotonicAt - receivedMonotonicAt);
}

export function deadlineRemainingMs(deadline: number, projectedServerNow: number): number {
  return Math.max(0, deadline - projectedServerNow);
}

export function deadlineRemainingDays(remainingMs: number): number {
  return remainingMs > 0 ? Math.ceil(remainingMs / DAY_MS) : 0;
}
