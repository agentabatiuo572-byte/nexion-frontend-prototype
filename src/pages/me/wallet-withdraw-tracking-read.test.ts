import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { createWithdrawalTrackingRead, resolveTrackedWithdrawal } from "./wallet-withdraw-tracking-read";

const scope = (overrides: Partial<{
  withdrawalNo: string;
  accountKey: string;
  accountBindingEpoch: number;
  sessionRevision: number;
  runtimeEpoch: number;
  pageEpoch: number;
}> = {}) => ({
  withdrawalNo: "WD-1",
  accountKey: "user:7",
  accountBindingEpoch: 1,
  sessionRevision: 1,
  runtimeEpoch: 1,
  pageEpoch: 1,
  ...overrides,
});

describe("withdrawal tracking exact read", () => {
  it("restores a cold deep link from the exact owned withdrawal read", async () => {
    const states: string[] = [];
    const apply = vi.fn();
    const read = vi.fn().mockResolvedValue({ withdrawalNo: "WD-1" });
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => scope(),
      apply,
      setStatus: (status) => states.push(status),
    });

    await loader.refresh();

    expect(read).toHaveBeenCalledWith("WD-1");
    expect(apply).toHaveBeenCalledWith({ withdrawalNo: "WD-1" });
    expect(states).toEqual(["loading", "ready"]);
  });

  it("waits for the matching bearer subject before its cold deep-link read", async () => {
    const states: string[] = [];
    const read = vi.fn().mockResolvedValue({ withdrawalNo: "WD-1" });
    let activeScope: ReturnType<typeof scope> | null = null;
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => activeScope,
      apply: vi.fn(),
      setStatus: (status) => states.push(status),
      wait: async () => { activeScope = scope({ accountKey: "user:7", sessionRevision: 2 }); },
      waitAttempts: 1,
      waitMilliseconds: 0,
    });

    await loader.refresh();

    expect(read).toHaveBeenCalledWith("WD-1");
    expect(states).toEqual(["waiting", "loading", "ready"]);
  });

  it("turns a bounded session restore wait into a retryable error without issuing a read", async () => {
    const states: string[] = [];
    const read = vi.fn();
    const wait = vi.fn(async () => undefined);
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => null,
      apply: vi.fn(),
      setStatus: (status) => states.push(status),
      wait,
      waitAttempts: 1,
      waitMilliseconds: 0,
    });

    await loader.refresh();

    expect(read).not.toHaveBeenCalled();
    expect(wait).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["waiting", "error"]);
  });
  it("keeps an exact-read failure recoverable and retries the same withdrawal", async () => {
    const states: string[] = [];
    const read = vi.fn()
      .mockRejectedValueOnce(new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE", retryable: true }))
      .mockResolvedValueOnce({ withdrawalNo: "WD-1" });
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => scope(),
      apply: vi.fn(),
      setStatus: (status) => states.push(status),
    });

    await loader.refresh();
    await loader.refresh();

    expect(read).toHaveBeenNthCalledWith(1, "WD-1");
    expect(read).toHaveBeenNthCalledWith(2, "WD-1");
    expect(states).toEqual(["loading", "error", "loading", "ready"]);
  });

  it("shows not-found only for the server-confirmed absence", async () => {
    const states: string[] = [];
    const loader = createWithdrawalTrackingRead({
      read: vi.fn().mockRejectedValue(new ApiError({ kind: "http", message: "WITHDRAWAL_NOT_FOUND", status: 404 })),
      currentScope: () => scope(),
      apply: vi.fn(),
      setStatus: (status) => states.push(status),
    });

    await loader.refresh();

    expect(states).toEqual(["loading", "not-found"]);
  });

  it("drops a response that belongs to an account or page generation that has since changed", async () => {
    const states: string[] = [];
    const apply = vi.fn();
    let complete: ((result: { withdrawalNo: string }) => void) | undefined;
    const read = vi.fn(() => new Promise<{ withdrawalNo: string }>((resolve) => { complete = resolve; }));
    let activeScope = scope();
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => activeScope,
      apply,
      setStatus: (status) => states.push(status),
    });

    const pending = loader.refresh();
    activeScope = scope({ accountKey: "user:8", accountBindingEpoch: 2, pageEpoch: 2 });
    loader.invalidate();
    complete?.({ withdrawalNo: "WD-1" });
    await pending;

    expect(apply).not.toHaveBeenCalled();
    expect(states).toEqual(["loading"]);
  });

  it("retries after the same account receives a new bearer-session revision and applies only its new result", async () => {
    const states: string[] = [];
    const apply = vi.fn();
    const completes: Array<(result: { withdrawalNo: string }) => void> = [];
    const read = vi.fn(() => new Promise<{ withdrawalNo: string }>((resolve) => { completes.push(resolve); }));
    let activeScope = scope();
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => activeScope,
      apply,
      setStatus: (status) => states.push(status),
    });

    const pending = loader.refresh();
    activeScope = scope({ sessionRevision: 2 });
    completes[0]?.({ withdrawalNo: "WD-1" });
    await pending;
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    completes[1]?.({ withdrawalNo: "WD-1" });
    await vi.waitFor(() => expect(states.at(-1)).toBe("ready"));

    expect(apply).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["loading", "loading", "ready"]);
  });

  it("retries after a runtime epoch change and never applies the old result", async () => {
    const apply = vi.fn();
    const completes: Array<(result: { withdrawalNo: string }) => void> = [];
    const read = vi.fn(() => new Promise<{ withdrawalNo: string }>((resolve) => { completes.push(resolve); }));
    let activeScope: ReturnType<typeof scope> | null = scope();
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => activeScope,
      apply,
      setStatus: vi.fn(),
    });

    const pending = loader.refresh();
    activeScope = scope({ runtimeEpoch: 2 });
    completes[0]?.({ withdrawalNo: "WD-1" });
    await pending;
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    completes[1]?.({ withdrawalNo: "WD-1" });
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
  });

  it("does not retry a stale result after the page becomes hidden", async () => {
    const apply = vi.fn();
    let complete: ((result: { withdrawalNo: string }) => void) | undefined;
    const read = vi.fn(() => new Promise<{ withdrawalNo: string }>((resolve) => { complete = resolve; }));
    let activeScope: ReturnType<typeof scope> | null = scope();
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => activeScope,
      apply,
      setStatus: vi.fn(),
    });

    const pending = loader.refresh();
    activeScope = null;
    complete?.({ withdrawalNo: "WD-1" });
    await pending;

    expect(read).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it("bounds automatic session recovery when the bearer changes again", async () => {
    const states: string[] = [];
    const completes: Array<(result: { withdrawalNo: string }) => void> = [];
    const read = vi.fn(() => new Promise<{ withdrawalNo: string }>((resolve) => { completes.push(resolve); }));
    let activeScope: ReturnType<typeof scope> | null = scope();
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => activeScope,
      apply: vi.fn(),
      setStatus: (status) => states.push(status),
    });

    const first = loader.refresh();
    activeScope = scope({ sessionRevision: 2 });
    completes[0]?.({ withdrawalNo: "WD-1" });
    await first;
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    activeScope = scope({ sessionRevision: 3 });
    completes[1]?.({ withdrawalNo: "WD-1" });
    await vi.waitFor(() => expect(states.at(-1)).toBe("error"));

    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not let an invalidated older request unlock a newer recovery chain", async () => {
    const states: string[] = [];
    const completes: Array<(result: { withdrawalNo: string }) => void> = [];
    const read = vi.fn(() => new Promise<{ withdrawalNo: string }>((resolve) => { completes.push(resolve); }));
    let activeScope: ReturnType<typeof scope> | null = scope();
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => activeScope,
      apply: vi.fn(),
      setStatus: (status) => states.push(status),
    });

    const oldA = loader.refresh();
    loader.invalidate();
    const currentB = loader.refresh();
    activeScope = scope({ sessionRevision: 2 });
    completes[1]?.({ withdrawalNo: "WD-1" });
    await currentB;
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));

    // A settles after B has dispatched its bounded recovery C. It is obsolete
    // and must not clear C's request-owned recovery lock.
    completes[0]?.({ withdrawalNo: "WD-1" });
    await oldA;
    activeScope = scope({ sessionRevision: 3 });
    completes[2]?.({ withdrawalNo: "WD-1" });
    await vi.waitFor(() => expect(states.at(-1)).toBe("error"));

    expect(read).toHaveBeenCalledTimes(3); // A plus exactly B and recovery C
  });

  it("restarts the same scope after invalidation instead of leaving its new read behind an old request", async () => {
    const apply = vi.fn();
    const completes: Array<(result: { withdrawalNo: string }) => void> = [];
    const read = vi.fn(() => new Promise<{ withdrawalNo: string }>((resolve) => { completes.push(resolve); }));
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => scope(),
      apply,
      setStatus: vi.fn(),
    });

    const oldRequest = loader.refresh();
    loader.invalidate();
    const freshRequest = loader.refresh();
    expect(read).toHaveBeenCalledTimes(2);

    completes[0]?.({ withdrawalNo: "WD-1" });
    completes[1]?.({ withdrawalNo: "WD-1" });
    await Promise.all([oldRequest, freshRequest]);

    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("uses the newer store snapshot after polling changes the exact-read row", () => {
    const initial = { id: "WD-1", status: "submitted" };
    const exact = { id: "WD-1", status: "review" };
    const polled = { id: "WD-1", status: "confirmed" };

    expect(resolveTrackedWithdrawal(exact, initial, initial)).toBe(exact);
    expect(resolveTrackedWithdrawal(exact, polled, initial)).toBe(polled);
  });
  it("coalesces duplicate refreshes for the same visible account and page scope", async () => {
    const completes: Array<(result: { withdrawalNo: string }) => void> = [];
    const read = vi.fn(() => new Promise<{ withdrawalNo: string }>((resolve) => { completes.push(resolve); }));
    const loader = createWithdrawalTrackingRead({
      read,
      currentScope: () => scope(),
      apply: vi.fn(),
      setStatus: vi.fn(),
    });

    const first = loader.refresh();
    const second = loader.refresh();
    completes.forEach((complete) => complete({ withdrawalNo: "WD-1" }));
    await Promise.all([first, second]);

    expect(read).toHaveBeenCalledTimes(1);
  });
});
