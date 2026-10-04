export type VoucherPopupCadence = {
  delayMs: number;
  cooldownHours: number;
  maxPerSession: number;
  voucherId: string;
  /** Server's next eligible instant; zero/omitted means immediately eligible. */
  nextEligibleAt?: number;
};

type ScheduleReason = "normal" | "observation-modal-close";

type SchedulerOptions<TScope> = {
  isHome: () => boolean;
  isObservationModalOpen: () => boolean;
  isBlockingSheetOpen: () => boolean;
  /** Read the live per-session auto-push count immediately before opening. */
  sessionShownCount?: () => number;
  cadence: () => VoucherPopupCadence | null;
  captureScope: () => TScope;
  isCurrentScope: (scope: TScope) => boolean;
  tryAutoPush: (options: { cooldownHours: number; maxPerSession: number }) => boolean;
  markPopupSeen: (voucherId: string) => void | Promise<unknown>;
  now?: () => number;
};

function validCadence(value: VoucherPopupCadence | null): value is VoucherPopupCadence {
  return !!value
    && Number.isFinite(value.delayMs) && value.delayMs >= 0
    && Number.isFinite(value.cooldownHours) && value.cooldownHours >= 0
    && Number.isInteger(value.maxPerSession) && value.maxPerSession > 0
    && typeof value.voucherId === "string" && value.voucherId.trim().length > 0
    && (value.nextEligibleAt === undefined
      || Number.isSafeInteger(value.nextEligibleAt) && value.nextEligibleAt >= 0);
}

function sameCadence(left: VoucherPopupCadence, right: VoucherPopupCadence): boolean {
  return left.delayMs === right.delayMs
    && left.cooldownHours === right.cooldownHours
    && left.maxPerSession === right.maxPerSession
    && left.voucherId === right.voucherId
    && left.nextEligibleAt === right.nextEligibleAt;
}

/**
 * Home voucher auto-push arbitration. Native acceptance observation uses a
 * platform modal that is not represented by Vue state, so its close event is
 * an explicit one-shot retry boundary. Every actual push still passes through
 * the live cadence, scope, route, modal, and claim-sheet checks at fire time.
 */
export function createVoucherPopupScheduler<TScope>(options: SchedulerOptions<TScope>) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerReason: ScheduleReason | null = null;
  let scheduleGeneration = 0;
  let modalCloseConsumed = false;
  let blockedModalScope: TScope | null = null;
  const now = options.now ?? (() => Date.now());

  function cancel(): void {
    scheduleGeneration += 1;
    if (timer) clearTimeout(timer);
    timer = null;
    timerReason = null;
  }

  function schedule(reason: ScheduleReason = "normal"): void {
    if (timer && timerReason === "observation-modal-close" && reason === "normal") return;
    if (timer) clearTimeout(timer);
    timer = null;
    timerReason = null;

    let cadence: VoucherPopupCadence | null;
    let scope: TScope;
    try {
      if (!options.isHome()) return;
      cadence = options.cadence();
      if (!validCadence(cadence)) return;
      scope = options.captureScope();
      // Capture the scope that opened the native modal. A delayed close from
      // an older account/RunID must not arm the current Home after a switch.
      if (options.isObservationModalOpen()) {
        if (blockedModalScope === null) blockedModalScope = scope;
        modalCloseConsumed = false;
      } else {
        blockedModalScope = null;
      }
    } catch {
      return;
    }

    // Keep the validated value immutable for the delayed callback. A mutable
    // `let cadence` is intentionally used only while reading the provider;
    // TypeScript cannot retain its type narrowing across that callback.
    const scheduledCadence = cadence;
    const generation = ++scheduleGeneration;
    timerReason = reason;
    const waitMs = Math.max(scheduledCadence.delayMs, Math.max(0, (scheduledCadence.nextEligibleAt ?? 0) - now()));
    timer = setTimeout(() => {
      if (generation !== scheduleGeneration) return;
      timer = null;
      timerReason = null;

      let liveCadence: VoucherPopupCadence | null;
      try {
        liveCadence = options.cadence();
        if (!validCadence(liveCadence) || !sameCadence(scheduledCadence, liveCadence)) {
          schedule(reason);
          return;
        }
        // Do not turn a server cooldown into a one-shot client guess. If the
        // server says the voucher is not eligible yet, retain the same reason
        // and wait until its authoritative next-eligible instant.
        if ((liveCadence.nextEligibleAt ?? 0) > now()) {
          schedule(reason);
          return;
        }
        if (!options.isHome()
          || !options.isCurrentScope(scope)
          || options.isBlockingSheetOpen()) return;
        if (options.isObservationModalOpen()) {
          if (blockedModalScope === null) blockedModalScope = scope;
          return;
        }
        if (options.sessionShownCount) {
          const shown = options.sessionShownCount();
          if (!Number.isFinite(shown) || shown >= liveCadence.maxPerSession) return;
        }
      } catch {
        return;
      }

      if (!options.tryAutoPush({
        cooldownHours: liveCadence.cooldownHours,
        maxPerSession: liveCadence.maxPerSession,
      })) return;
      void options.markPopupSeen(liveCadence.voucherId);
    }, waitMs);
  }

  /** Cancel a pending timer as soon as the native modal opens, even when the
   * open event races the scheduled callback. */
  function onObservationModalOpened(scope: TScope): void {
    blockedModalScope = scope;
    modalCloseConsumed = false;
    cancel();
  }

  /** A duplicate close callback for one native modal must be idempotent. */
  function onObservationModalClosed(token: number): void {
    if (!Number.isFinite(token) || modalCloseConsumed) return;
    modalCloseConsumed = true;
    if (blockedModalScope !== null) {
      let current = false;
      try { current = options.isCurrentScope(blockedModalScope); } catch { current = false; }
      if (!current) {
        blockedModalScope = null;
        cancel();
        return;
      }
    }
    blockedModalScope = null;
    schedule("observation-modal-close");
  }

  return { schedule, onObservationModalOpened, onObservationModalClosed, cancel };
}
