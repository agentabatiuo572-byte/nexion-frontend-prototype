import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeGpuRequest } from "./native-gpu-request";

afterEach(() => vi.useRealTimers());
describe("page-local native GPU observation requests", () => {
  it("waits for the matching request and ignores invalid or stale responses", async () => {
    const send = vi.fn(); const reader = createNativeGpuRequest(send);
    const pending = reader.read();
    expect(reader.read()).toBe(pending);
    expect(send).toHaveBeenCalledExactlyOnceWith(1);
    reader.receive({ id: 0, status: "observed", renderer: "old GPU" });
    reader.receive({ id: 1, status: "observed", renderer: "" });
    reader.receive({ id: 1, status: "invented", renderer: "fake GPU" });
    reader.receive({ id: 1, status: "observed", renderer: "Adreno actual" });
    expect(await pending).toEqual({ status: "observed", renderer: "Adreno actual" });
    const next = reader.read();
    expect(send).toHaveBeenLastCalledWith(2);
    reader.receive({ id: 1, status: "observed", renderer: "old GPU" });
    reader.receive({ id: 2, status: "renderer-masked", renderer: "must not escape" });
    expect(await next).toEqual({ status: "renderer-masked", renderer: "" });
  });
  it("times out without producing an unknown calibration payload, and permits an explicit retry", async () => {
    vi.useFakeTimers(); const send = vi.fn(); const reader = createNativeGpuRequest(send);
    const pending = expect(reader.read()).rejects.toThrow("PHONE_GPU_VIEW_TIMEOUT");
    await vi.advanceTimersByTimeAsync(2_000); await pending;
    const next = reader.read();
    reader.receive({ id: 1, status: "observed", renderer: "late" });
    reader.receive({ id: 2, status: "observed", renderer: "current" });
    expect((await next).renderer).toBe("current");
  });
  it("unmount rejects a pending observation and cannot create a new one", async () => {
    const reader = createNativeGpuRequest(vi.fn());
    const pending = expect(reader.read()).rejects.toThrow("PHONE_GPU_VIEW_DISPOSED");
    reader.dispose(); await pending;
    reader.receive({ id: 1, status: "observed", renderer: "late" });
    await expect(reader.read()).rejects.toThrow("PHONE_GPU_VIEW_DISPOSED");
  });
  it("a failed bridge dispatch is retryable without a second automatic request", async () => {
    const send = vi.fn(() => { throw new Error("view not available"); });
    const reader = createNativeGpuRequest(send);
    await expect(reader.read()).rejects.toThrow("PHONE_GPU_VIEW_UNAVAILABLE");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
