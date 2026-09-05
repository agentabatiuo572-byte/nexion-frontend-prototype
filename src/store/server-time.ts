/**
 * Server-time helper — single replacement point for client clock when
 * cutting over to a real backend.
 *
 * Currently returns `Date.now()` (client wall clock). When a real backend is
 * wired in, replace the body with a synced server-time fetch (cached with
 * skew adjustment, refreshed every few minutes). Every time-sensitive business
 * decision in this codebase routes through this helper so the cutover is a
 * single line change.
 *
 * ⚠️ Why this matters:
 *   - phase progression, weekly/monthly quest rollover, lifecycle decay,
 *     task-lock month progress, commission unlock, trial state machine, etc.
 *     ALL depend on "what time does the platform think it is now?".
 *   - If client clock skews or user tampers, business decisions corrupt:
 *     user stays in P1 phase forever (lower withdrawal threshold),
 *     re-claims weekly/monthly rewards, fakes high efficiency, etc.
 *   - Production: server is authoritative. Client `Date.now()` is only a
 *     local-display fallback.
 *
 * PRODUCTION SWAP (single point):
 *   1. Add a cached `serverNowSkewMs` populated from `GET /api/server-time`
 *      on app mount + every 5 min.
 *   2. Return `Date.now() + serverNowSkewMs` here.
 *   3. (Optional) Throw if `serverNowSkewMs` is undefined and we're not in
 *      mock mode, to surface broken time-sync early.
 */

export function mockServerNow(): number {
  return Date.now();
}

// ─────────────────────────────────────────────────────────────
// Shared time constants — formerly duplicated across 4+ store files.
// ─────────────────────────────────────────────────────────────

export const ONE_SECOND_MS = 1_000;
export const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;
export const ONE_WEEK_MS = 7 * ONE_DAY_MS;
/** 30-day "month" approximation — for business duration math, NOT calendar months. */
export const ONE_MONTH_MS = 30 * ONE_DAY_MS;
