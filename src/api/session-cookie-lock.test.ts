import { afterEach, describe, expect, it, vi } from "vitest";
import { withSessionCookieLock } from "./session-cookie-lock";

afterEach(() => vi.unstubAllGlobals());
describe("session cookie rotation lock", () => {
  it("uses the same browser lock for cookie mutations without sharing credentials", async () => {
    const request = vi.fn(async (_name: string, work: () => Promise<string>) => work());
    vi.stubGlobal("navigator", { locks: { request } });
    await expect(withSessionCookieLock(async () => "done")).resolves.toBe("done");
    expect(request).toHaveBeenCalledWith("nexgrid-user-session-cookie", expect.any(Function));
  });
  it("does not retry a rejected lock acquisition outside the lock", async () => {
    const request = vi.fn().mockRejectedValue(new Error("lock unavailable"));
    vi.stubGlobal("navigator", { locks: { request } });
    const work = vi.fn();
    await expect(withSessionCookieLock(work)).rejects.toMatchObject({
      kind: "configuration", message: "COOKIE_LOCK_UNAVAILABLE",
    });
    expect(work).not.toHaveBeenCalled();
  });
  it("preserves an error raised by work after acquiring the lock", async () => {
    vi.stubGlobal("navigator", { locks: { request: (_name: string, work: () => Promise<unknown>) => work() } });
    await expect(withSessionCookieLock(async () => { throw new Error("server failed"); }))
      .rejects.toThrow("server failed");
  });
  it("serializes same-context fallback work and recovers after a rejected mutation", async () => {
    vi.stubGlobal("navigator", undefined);
    const calls: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = withSessionCookieLock(async () => { calls.push("first"); await gate; throw new Error("failed"); });
    const rejected = expect(first).rejects.toThrow("failed");
    const next = withSessionCookieLock(async () => { calls.push("next"); return 2; });
    await vi.waitFor(() => expect(calls).toEqual(["first"]));
    release();
    await rejected;
    await expect(next).resolves.toBe(2);
    expect(calls).toEqual(["first", "next"]);
  });
  it("never sends a browser cookie mutation without a cross-tab lock", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("indexedDB", undefined);
    const work = vi.fn(async () => "unsafe");
    await expect(withSessionCookieLock(work)).rejects.toThrow("COOKIE_LOCK_UNAVAILABLE");
    expect(work).not.toHaveBeenCalled();
  });
});
