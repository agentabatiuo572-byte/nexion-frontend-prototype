import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLatestAbortableRequest,
  NOVA_MIN_THINKING_MS,
  novaThinkingStageAt,
  novaThinkingNow,
  remainingNovaThinkingMs,
} from "./nova-thinking";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Nova visible thinking cadence", () => {
  it("holds a fast answer until the minimum visible duration is reached", () => {
    expect(NOVA_MIN_THINKING_MS).toBe(1_800);
    expect(remainingNovaThinkingMs(10_000, 10_150)).toBe(1_650);
  });

  it("does not add delay after an already slow model response", () => {
    expect(remainingNovaThinkingMs(10_000, 12_500)).toBe(0);
  });

  it("never treats a clock rollback as elapsed thinking time", () => {
    expect(remainingNovaThinkingMs(10_000, 9_900)).toBe(1_800);
  });

  it("moves through user-facing stages before composing", () => {
    expect(novaThinkingStageAt(0)).toBe("understanding");
    expect(novaThinkingStageAt(599)).toBe("understanding");
    expect(novaThinkingStageAt(600)).toBe("checking");
    expect(novaThinkingStageAt(1_199)).toBe("checking");
    expect(novaThinkingStageAt(1_200)).toBe("composing");
  });

  it("uses a monotonic clock so wall-clock jumps cannot shorten the cadence", () => {
    vi.spyOn(performance, "now").mockReturnValue(725.5);
    vi.spyOn(Date, "now").mockReturnValue(99_999_999);

    expect(novaThinkingNow()).toBe(725.5);
  });
});

describe("Nova request cancellation", () => {
  it("cancels the native request when AbortController is absent", () => {
    vi.stubGlobal("AbortController", undefined);
    const control = createLatestAbortableRequest();
    const request = control.begin();
    const cancelled = vi.fn();
    request.signal.addEventListener("abort", cancelled);
    control.cancel();
    expect(request.signal.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalledTimes(1);
  });
  it("aborts the current model request and invalidates its epoch", () => {
    const control = createLatestAbortableRequest();
    const request = control.begin();

    expect(request.signal.aborted).toBe(false);
    expect(control.isCurrent(request.epoch)).toBe(true);

    control.cancel();

    expect(request.signal.aborted).toBe(true);
    expect(control.isCurrent(request.epoch)).toBe(false);
  });

  it("does not let an old request finish or cancel a newer request", () => {
    const control = createLatestAbortableRequest();
    const oldRequest = control.begin();
    const currentRequest = control.begin();

    expect(oldRequest.signal.aborted).toBe(true);
    expect(control.finish(oldRequest.epoch)).toBe(false);
    expect(currentRequest.signal.aborted).toBe(false);
    expect(control.isCurrent(currentRequest.epoch)).toBe(true);
    expect(control.finish(currentRequest.epoch)).toBe(true);
  });
});
