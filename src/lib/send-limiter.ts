// Sliding-window send limiter — client-side UX guard for chat inputs.
// A real backend enforces the same policy server-side (HTTP 429 + Retry-After);
// this mirrors that contract (max sends per rolling window, retry hint in
// seconds) so swapping in real API errors is zero-rework.

export interface SendVerdict {
  ok: boolean;
  /** Seconds until the next send is allowed (0 when ok). */
  retryInSec: number;
}

export interface SendLimiter {
  /** Try to consume one send slot. Only successful sends count against the window. */
  tryAcquire(now?: number): SendVerdict;
}

/** @param minGapMs Minimum gap between two consecutive sends (anti double-tap). */
export function createSendLimiter(max: number, windowMs: number, minGapMs = 0): SendLimiter {
  let stamps: number[] = [];
  // Tracked separately from `stamps`: the window filter may evict the newest stamp
  // (when minGapMs > windowMs), which would silently disable the gap gate.
  let lastSentAt: number | undefined;
  return {
    tryAcquire(now = Date.now()): SendVerdict {
      stamps = stamps.filter((t) => now - t < windowMs);
      // Two independent gates; report the LONGER wait so the retry hint is honest.
      const gapWait = lastSentAt === undefined ? 0 : minGapMs - (now - lastSentAt);
      const windowWait = stamps.length >= max ? stamps[0] + windowMs - now : 0;
      const wait = Math.max(gapWait, windowWait);
      if (wait > 0) {
        return { ok: false, retryInSec: Math.max(1, Math.ceil(wait / 1000)) };
      }
      stamps = [...stamps, now];
      lastSentAt = now;
      return { ok: true, retryInSec: 0 };
    },
  };
}
