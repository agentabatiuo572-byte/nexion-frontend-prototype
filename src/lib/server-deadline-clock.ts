const DAY_MS = 86_400_000;
let trustedClock: (() => unknown) | null = null;

export function hasMonotonicClock(): boolean {
  return typeof performance !== "undefined" && typeof performance.now === "function";
}

/** A remote deadline must never substitute the device wall clock. */
export function readTrustedMonotonicNowMs(): number | null {
  try {
    if (!trustedClock) {
      // Keep one epoch for every live server-time anchor, including after a bridge failure.
      // #ifdef APP-PLUS
      if (typeof plus !== "undefined" && plus.os?.name === "Android" && typeof plus.android?.invoke === "function") {
        const android = plus.android;
        // elapsedRealtime includes deep sleep; wall time and uptimeMillis do not satisfy this contract.
        trustedClock = () => android.invoke("android.os.SystemClock", "elapsedRealtime");
      }
      // #endif
      if (!trustedClock && hasMonotonicClock()) {
        trustedClock = () => hasMonotonicClock() ? performance.now() : undefined;
      }
    }
    const now = trustedClock?.();
    return typeof now === "number" && Number.isFinite(now) && now >= 0 ? now : null;
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
