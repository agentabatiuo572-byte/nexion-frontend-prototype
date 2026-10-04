import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createVoucherPopupScheduler, type VoucherPopupCadence } from "./voucher-popup-scheduler";

describe("voucher popup scheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function harness() {
    let modalOpen = true;
    let scope = "account-a/run-a";
    let home = true;
    let blockingSheetOpen = false;
    let sessionShownCount = 0;
    let cadence: VoucherPopupCadence | null = {
      delayMs: 1_300,
      cooldownHours: 24,
      maxPerSession: 1,
      voucherId: "V-1",
    };
    let attempts = 0;
    const markPopupSeen = vi.fn();
    const scheduler = createVoucherPopupScheduler({
      isHome: () => home,
      isObservationModalOpen: () => modalOpen,
      isBlockingSheetOpen: () => blockingSheetOpen,
      sessionShownCount: () => sessionShownCount,
      cadence: () => cadence,
      captureScope: () => scope,
      isCurrentScope: (captured) => captured === scope,
      tryAutoPush: vi.fn(() => {
        attempts += 1;
        return true;
      }),
      markPopupSeen,
    });
    return {
      scheduler,
      setModalOpen: (value: boolean) => { modalOpen = value; },
      setScope: (value: string) => { scope = value; },
      setHome: (value: boolean) => { home = value; },
      setBlockingSheetOpen: (value: boolean) => { blockingSheetOpen = value; },
      setSessionShownCount: (value: number) => { sessionShownCount = value; },
      setCadence: (value: VoucherPopupCadence | null) => { cadence = value; },
      attempts: () => attempts,
      markPopupSeen,
    };
  }

  it("retries once after the observation modal closes, still honoring delay", () => {
    const h = harness();

    h.scheduler.schedule();
    vi.advanceTimersByTime(1_300);
    expect(h.attempts()).toBe(0);

    h.setModalOpen(false);
    h.scheduler.onObservationModalClosed(1);
    h.scheduler.onObservationModalClosed(1);
    h.scheduler.schedule(); // duplicate catalog refresh must not replace the retry
    vi.advanceTimersByTime(1_299);
    expect(h.attempts()).toBe(0);
    vi.advanceTimersByTime(1);

    expect(h.attempts()).toBe(1);
    expect(h.markPopupSeen).toHaveBeenCalledOnce();
    expect(h.markPopupSeen).toHaveBeenCalledWith("V-1");
  });

  it("drops a delayed retry when account or sandbox run scope changes", () => {
    const h = harness();
    h.scheduler.schedule();
    h.setModalOpen(false);
    h.scheduler.onObservationModalClosed(1);
    h.setScope("account-b/run-b");
    vi.advanceTimersByTime(1_300);
    expect(h.attempts()).toBe(0);
    expect(h.markPopupSeen).not.toHaveBeenCalled();
  });

  it("treats all close callbacks for one modal as a single retry even with different tokens", () => {
    const h = harness();
    h.scheduler.schedule();
    h.setModalOpen(false);
    h.scheduler.onObservationModalClosed(1);
    h.scheduler.onObservationModalClosed(2);
    vi.advanceTimersByTime(1_300);
    expect(h.attempts()).toBe(1);
  });

  it("drops a close from a stale account or RunID while the modal is open", () => {
    const h = harness();
    h.scheduler.schedule();
    h.setScope("account-b/run-b");
    h.setModalOpen(false);
    h.scheduler.onObservationModalClosed(1);
    vi.advanceTimersByTime(1_300);
    expect(h.attempts()).toBe(0);
  });

  it("rechecks route and blocking sheet at fire time", () => {
    const h = harness();
    h.setModalOpen(false);
    h.scheduler.schedule();
    h.setHome(false);
    vi.advanceTimersByTime(1_300);
    expect(h.attempts()).toBe(0);

    h.setHome(true);
    h.scheduler.schedule();
    h.setBlockingSheetOpen(true);
    vi.advanceTimersByTime(1_300);
    expect(h.attempts()).toBe(0);
  });

  it("does not push before the server next-eligible instant", () => {
    const h = harness();
    const eligibleAt = Date.now() + 5_000;
    h.setCadence({
      delayMs: 300,
      cooldownHours: 1,
      maxPerSession: 1,
      voucherId: "V-1",
      nextEligibleAt: eligibleAt,
    });

    h.setModalOpen(false);
    h.scheduler.schedule();
    vi.advanceTimersByTime(4_999);
    expect(h.attempts()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(h.attempts()).toBe(1);
  });

  it("rechecks the session cap at fire time", () => {
    const h = harness();
    h.setModalOpen(false);
    h.scheduler.schedule();
    h.setSessionShownCount(1);
    vi.advanceTimersByTime(1_300);
    expect(h.attempts()).toBe(0);
  });

  it.each([
    ["disabled or expired", null],
  ])("fails closed when the current cadence is %s", (_label, currentCadence) => {
    const h = harness();
    h.setCadence(currentCadence);
    h.setModalOpen(false);
    h.scheduler.schedule();
    vi.advanceTimersByTime(10_000);
    expect(h.attempts()).toBe(0);
  });
});
