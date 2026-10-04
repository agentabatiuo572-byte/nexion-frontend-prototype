import { afterEach, describe, expect, it, vi } from "vitest";
import { createPayoutClock } from "./payout-clock";
afterEach(() => vi.useRealTimers());
describe("payout boundary clock", () => {
  it("does not run a queued refresh after the page is hidden", async () => {
    vi.useFakeTimers(); vi.setSystemTime(3000);
    const refresh = vi.fn();
    const clock = createPayoutClock({ tick: vi.fn(), nextPayoutAt: () => 2000, refresh });
    clock.start(); clock.stop();
    await Promise.resolve(); await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("ticks, refreshes once per boundary, and stops on hide", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    let next = 3000;
    const tick = vi.fn(); const refresh = vi.fn();
    const clock = createPayoutClock({ tick, nextPayoutAt: () => next, refresh });
    clock.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(tick).toHaveBeenLastCalledWith(3000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
    next = 6000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    clock.stop();
    const calls = tick.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(calls);
    clock.start(); clock.start();
    expect(vi.getTimerCount()).toBe(1);
    clock.stop();
  });
  it("ignores unavailable boundaries and contains refresh failures", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    let next = NaN;
    const refresh = vi.fn().mockRejectedValue(new Error("offline"));
    const clock = createPayoutClock({ tick: vi.fn(), nextPayoutAt: () => next, refresh });
    clock.start(); await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).not.toHaveBeenCalled();
    next = 3000;
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
    clock.stop();
  });
});
