import { afterEach, describe, expect, it, vi } from "vitest";
import { createHomeDisplayPlayer, homeDisplayAt, parseHomeDisplayBatch, type HomeDisplayBatch } from "./home-display-player";

const startAt = 1_790_000_000_000;
const batch = (): HomeDisplayBatch => ({ enabled: true, startAt, serverNow: startAt, validUntil: startAt + 60_000, sequence: 1,
  online: Array.from({ length: 121 }, (_, i) => 28432 + i * 2),
  paidCents: Array.from({ length: 121 }, (_, i) => 13053200 + i * 330) });
afterEach(() => vi.useRealTimers());

describe("shared home display batches", () => {
  it("reopening uses the same timestamped server values, with cent precision", () => {
    expect(homeDisplayAt(parseHomeDisplayBatch(batch()), startAt + 42_000)).toEqual({ online: 28516, paid: 130670.6 });
    expect(homeDisplayAt(batch(), startAt + 121_000)).toBeNull();
    expect(homeDisplayAt({ ...batch(), enabled: false, online: [28516], paidCents: [13067060] }, startAt + 900_000))
      .toEqual({ online: 28516, paid: 130670.6 });
  });
  it("rejects malformed, mismatched and decreasing plans", () => {
    for (const value of [{ ...batch(), online: [] }, { ...batch(), paidCents: [1] },
      { ...batch(), online: batch().online.map((n, i) => i === 20 ? 0 : n) }, { ...batch(), startAt: NaN }])
      expect(() => parseHomeDisplayBatch(value)).toThrow();
  });
  it("paints each second, fetches once a minute, and stops entirely when hidden", async () => {
    vi.useFakeTimers(); vi.setSystemTime(startAt);
    const fetch = vi.fn(async () => ({ ...batch(), serverNow: Date.now(), validUntil: Date.now() + 60_000 }));
    const render = vi.fn();
    const player = createHomeDisplayPlayer({ fetch, render, now: () => Date.now() });
    player.start(); player.start();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenLastCalledWith({ online: 28550, paid: 130726.7 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    player.stop();
    const paints = render.mock.calls.length;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(paints);
    player.start(); await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    player.stop();
  });
  it("a failed control refresh stops playing stale future values", async () => {
    vi.useFakeTimers(); vi.setSystemTime(startAt);
    const fetch = vi.fn().mockResolvedValueOnce(batch()).mockRejectedValueOnce(new Error("offline"));
    const render = vi.fn(); const player = createHomeDisplayPlayer({ fetch, render, now: () => Date.now() });
    player.start(); await vi.advanceTimersByTimeAsync(60_000);
    expect(render).toHaveBeenLastCalledWith(null);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(render).toHaveBeenLastCalledWith(null);
    player.stop();
  });
  it("clock rollback cannot reset the counter or postpone refresh for an hour", async () => {
    vi.useFakeTimers(); vi.setSystemTime(startAt);
    const fetch = vi.fn(async () => batch()); const render = vi.fn();
    const player = createHomeDisplayPlayer({ fetch, render, now: () => Date.now() });
    player.start(); await vi.advanceTimersByTimeAsync(30_000);
    const last = render.mock.calls.at(-1)![0].online;
    vi.setSystemTime(Date.now() - 3600_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(render.mock.calls.at(-1)![0].online).toBeGreaterThanOrEqual(last);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    player.stop();
  });
  it("a successful old cache response cannot renew the control expiry", async () => {
    vi.useFakeTimers(); vi.setSystemTime(startAt + 59_000);
    const fetch = vi.fn().mockResolvedValueOnce({ ...batch(), serverNow: Date.now() }).mockRejectedValue(new Error("offline"));
    const render = vi.fn(); const player = createHomeDisplayPlayer({ fetch, render, now: () => Date.now() });
    player.start(); await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(null);
    player.stop();
  });
  it("ignores a response that arrives after leaving the page", async () => {
    vi.useFakeTimers();
    let resolve!: (v: HomeDisplayBatch) => void;
    const render = vi.fn();
    const player = createHomeDisplayPlayer({ now: () => Date.now(), render,
      fetch: () => new Promise(r => { resolve = r; }) });
    player.start(); player.stop(); resolve(batch()); await Promise.resolve();
    expect(render).not.toHaveBeenCalled();
  });
});
