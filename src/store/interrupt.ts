/**
 * Task interruption (reconnect grace) policy — single source of truth.
 *
 * Real distributed-compute schedulers do NOT drop a node's in-flight job the
 * instant its heartbeat misses. They retry the node for a short window; if it
 * recovers, the job continues, otherwise the job is cancelled and reassigned
 * to another node. NexGrid mirrors that: when a phone loses power or network
 * while running a task, it enters a grace window (INTERRUPT_GRACE_MS) during
 * which the scheduler retries up to INTERRUPT_MAX_RETRIES times.
 *   - Recover within the window → the SAME task resumes (its progress clock is
 *     shifted forward by the outage so suspended time doesn't count).
 *   - Window elapses → the task is cancelled (progress forfeit, no receipt) and
 *     the device picks up a FRESH task once conditions return — never resumes.
 *
 * The user cannot manually pause a task/device — a node is either running or
 * (involuntarily) interrupted. There is no opt-in pause control.
 *
 * SESSION EVICTION is a DIFFERENT, harder cancel that does NOT use this grace
 * window: when the account is claimed by another device, logged out, or revoked
 * by ops, the node is no longer authorized, so its in-flight job is voided
 * IMMEDIATELY (no retries, progress forfeit, no receipt — the "回退"/rollback)
 * and mining freezes until a fresh session is established. That path lives in
 * useApp().interruptAllTasks() / resumeMining(); this connectivity-grace policy
 * applies only to power/network blips.
 *
 * ⚠️ MOCK-ONLY: production runs this clock server-side — the device agent's
 * heartbeat drives it (PRD §6.11/§12.2 candidate `POST /api/device/:id/heartbeat`);
 * the client store only mirrors the `interruptedAt` the server reports.
 */
export const INTERRUPT_GRACE_MS = 30_000;
export const INTERRUPT_MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = INTERRUPT_GRACE_MS / INTERRUPT_MAX_RETRIES; // 6s per retry

export interface InterruptInfo {
  /** 1-based retry attempt currently in flight (capped at INTERRUPT_MAX_RETRIES). */
  retries: number;
  /** Whole seconds remaining before the held task is auto-cancelled. */
  remainingSec: number;
  /** True once the grace window has fully elapsed → cancel the task. */
  expired: boolean;
}

/**
 * Derive the live retry/countdown state for a device whose interruption began
 * at `interruptedAt` (epoch ms). Pure — both tick() (cancel decision) and the
 * device card (display) call this so the threshold can never drift between the
 * two.
 */
export function interruptInfo(interruptedAt: number, now: number): InterruptInfo {
  const elapsed = Math.max(0, now - interruptedAt);
  return {
    retries: Math.min(INTERRUPT_MAX_RETRIES, Math.floor(elapsed / RETRY_INTERVAL_MS) + 1),
    remainingSec: Math.max(0, Math.ceil((INTERRUPT_GRACE_MS - elapsed) / 1000)),
    expired: elapsed >= INTERRUPT_GRACE_MS,
  };
}
