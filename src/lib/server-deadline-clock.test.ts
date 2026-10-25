import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceMonotonicHighWater,
  deadlineRemainingDays,
  deadlineRemainingMs,
  projectServerNow,
} from "./server-deadline-clock";

let readTrustedMonotonicNowMs: typeof import("./server-deadline-clock").readTrustedMonotonicNowMs;
beforeEach(async () => {
  vi.resetModules();
  ({ readTrustedMonotonicNowMs } = await import("./server-deadline-clock"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("server deadline clock", () => {
  it("requires a finite monotonic clock and never substitutes wall time", async () => {
    for (const performance of [undefined, {}, { now: () => NaN }, { now: () => Infinity },
      { now: () => -1 }, { now: () => { throw new Error("unavailable"); } }]) {
      vi.resetModules();
      ({ readTrustedMonotonicNowMs } = await import("./server-deadline-clock"));
      vi.stubGlobal("performance", performance);
      expect(readTrustedMonotonicNowMs()).toBeNull();
    }
    vi.resetModules();
    ({ readTrustedMonotonicNowMs } = await import("./server-deadline-clock"));
    vi.stubGlobal("performance", { now: () => 0 });
    expect(readTrustedMonotonicNowMs()).toBe(0);
  });
  it("uses Android elapsed realtime without performance and expires at the server TTL after sleep", () => {
    vi.stubGlobal("performance", undefined);
    let elapsed = 100_000;
    const invoke = vi.fn(() => elapsed);
    vi.stubGlobal("plus", { os: { name: "Android" }, android: { invoke } });
    vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("wall clock must not be read"); });
    const receivedAt = readTrustedMonotonicNowMs()!;
    const serverNow = 1_800_000_000_000, deadline = serverNow + 60_000;
    expect(receivedAt).toBe(100_000);
    elapsed += 59_999;
    expect(deadlineRemainingMs(deadline, projectServerNow(serverNow, receivedAt, readTrustedMonotonicNowMs()!))).toBe(1);
    elapsed += 1;
    expect(deadlineRemainingMs(deadline, projectServerNow(serverNow, receivedAt, readTrustedMonotonicNowMs()!))).toBe(0);
    expect(invoke).toHaveBeenCalledWith("android.os.SystemClock", "elapsedRealtime");
  });
  it("keeps the native epoch through bridge failures and a later browser clock", () => {
    let value: unknown = 1_000;
    const invoke = vi.fn(() => value);
    vi.stubGlobal("plus", { os: { name: "Android" }, android: { invoke } });
    vi.stubGlobal("performance", { now: () => 50 });
    expect(readTrustedMonotonicNowMs()).toBe(1_000);
    for (value of [undefined, null, "2000", NaN, Infinity, -1]) expect(readTrustedMonotonicNowMs()).toBeNull();
    invoke.mockImplementationOnce(() => { throw new Error("bridge unavailable"); });
    expect(readTrustedMonotonicNowMs()).toBeNull();
    value = 2_000;
    expect(readTrustedMonotonicNowMs()).toBe(2_000);
  });
  it("pins the browser epoch if native capability becomes available later", () => {
    let elapsed = 50;
    vi.stubGlobal("performance", { now: () => elapsed });
    expect(readTrustedMonotonicNowMs()).toBe(50);
    const invoke = vi.fn(() => 100_000);
    vi.stubGlobal("plus", { os: { name: "Android" }, android: { invoke } });
    elapsed = 70;
    expect(readTrustedMonotonicNowMs()).toBe(70);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("can acquire native capability after an initial unavailable read", () => {
    vi.stubGlobal("performance", undefined);
    vi.stubGlobal("plus", { os: { name: "Android" } });
    expect(readTrustedMonotonicNowMs()).toBeNull();
    vi.stubGlobal("plus", { os: { name: "Android" }, android: {} });
    expect(readTrustedMonotonicNowMs()).toBeNull();
    vi.stubGlobal("plus", { os: { name: "Android" }, android: { invoke: () => 200 } });
    expect(readTrustedMonotonicNowMs()).toBe(200);
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
