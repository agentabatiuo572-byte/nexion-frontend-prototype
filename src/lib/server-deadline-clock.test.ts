import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceMonotonicHighWater,
  deadlineRemainingDays,
  deadlineRemainingMs,
  projectServerNow,
  readTrustedMonotonicNowMs,
} from "./server-deadline-clock";

afterEach(() => vi.unstubAllGlobals());

describe("server deadline clock", () => {
  it("requires a finite monotonic clock and never substitutes wall time", () => {
    for (const performance of [undefined, {}, { now: () => NaN }, { now: () => Infinity },
      { now: () => -1 }, { now: () => { throw new Error("unavailable"); } }]) {
      vi.stubGlobal("performance", performance);
      expect(readTrustedMonotonicNowMs()).toBeNull();
    }
    vi.stubGlobal("performance", { now: () => 0 });
    expect(readTrustedMonotonicNowMs()).toBe(0);
  });
  it("never moves backward when a wall-clock-like candidate is rolled back", () => {
    const serverNow = 1_800_000_000_000;
    const receivedAt = 1_000;
    const afterFiveSeconds = advanceMonotonicHighWater(receivedAt, 6_000);
    const afterRollback = advanceMonotonicHighWater(afterFiveSeconds, 2_000);

    expect(afterRollback).toBe(6_000);
    expect(projectServerNow(serverNow, receivedAt, afterRollback)).toBe(serverNow + 5_000);
  });

  it("keeps an expired deadline at zero after a clock rollback", () => {
    const serverNow = 1_800_000_000_000;
    const receivedAt = 1_000;
    const deadline = serverNow + 5_000;
    const expiredHighWater = advanceMonotonicHighWater(receivedAt, 7_000);
    const rolledBackHighWater = advanceMonotonicHighWater(expiredHighWater, 2_000);

    expect(deadlineRemainingMs(deadline, projectServerNow(serverNow, receivedAt, expiredHighWater))).toBe(0);
    expect(deadlineRemainingMs(deadline, projectServerNow(serverNow, receivedAt, rolledBackHighWater))).toBe(0);
  });

  it("rounds a positive partial day up and returns zero at the exact deadline", () => {
    expect(deadlineRemainingDays(1)).toBe(1);
    expect(deadlineRemainingDays(86_400_001)).toBe(2);
    expect(deadlineRemainingDays(0)).toBe(0);
  });
});
