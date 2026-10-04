import { describe, expect, it, vi } from "vitest";
import { runShareEventFlight } from "./share-event-flight";

describe("share event flight", () => {
  it("coalesces concurrent taps into one server fact and one readback", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const send = vi.fn(() => gate);
    const refresh = vi.fn().mockResolvedValue(true);
    const first = runShareEventFlight({ send, refresh, isCurrent: () => true, onFailure: vi.fn() });
    const second = runShareEventFlight({ send, refresh, isCurrent: () => true, onFailure: vi.fn() });
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not report success when canonical quest readback fails", async () => {
    const onFailure = vi.fn();
    await expect(runShareEventFlight({
      send: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(false),
      isCurrent: () => true,
      onFailure,
    })).resolves.toBe(false);
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it("silently discards a response after account or RunID scope changes", async () => {
    const onFailure = vi.fn();
    await expect(runShareEventFlight({
      send: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      isCurrent: () => false,
      onFailure,
    })).resolves.toBe(false);
    expect(onFailure).not.toHaveBeenCalled();
  });
});
