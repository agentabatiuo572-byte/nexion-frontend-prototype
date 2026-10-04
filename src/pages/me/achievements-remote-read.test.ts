import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { readAchievementsForCurrentSession } from "./achievements-remote-read";

describe("achievement remote cold-session reader", () => {
  it("waits for the restored matching subject before issuing the first points read", async () => {
    let accountKey = "default";
    let session: { accessToken: string; user: { userId: number } } | null = null;
    const read = vi.fn().mockResolvedValue({ streak: 1 });
    const wait = vi.fn(async () => {
      session = { accessToken: "access", user: { userId: 3775 } };
      accountKey = "user:3775";
    });

    await expect(readAchievementsForCurrentSession({
      accountKey: () => accountKey,
      session: () => session,
      isCurrent: () => true,
      read,
      wait,
      waitAttempts: 2,
      waitMilliseconds: 0,
    })).resolves.toEqual({ kind: "success", snapshot: { streak: 1 } });

    expect(wait).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reports a bounded restore timeout without sending an unauthenticated points request", async () => {
    const read = vi.fn();

    await expect(readAchievementsForCurrentSession({
      accountKey: () => "default",
      session: () => null,
      isCurrent: () => true,
      read,
      wait: async () => undefined,
      waitAttempts: 1,
      waitMilliseconds: 0,
    })).resolves.toEqual({ kind: "failure", failure: "SESSION_RESTORE_TIMEOUT" });

    expect(read).not.toHaveBeenCalled();
  });

  it("keeps real backend failures retryable and records only a safe error class", async () => {
    const read = vi.fn().mockRejectedValue(new ApiError({
      kind: "network", message: "proxy socket reset", retryable: true,
    }));

    await expect(readAchievementsForCurrentSession({
      accountKey: () => "user:3775",
      session: () => ({ accessToken: "access", user: { userId: 3775 } }),
      isCurrent: () => true,
      read,
    })).resolves.toEqual({ kind: "failure", failure: "NETWORK" });

    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not issue a delayed read after the account generation becomes stale", async () => {
    let current = true;
    const read = vi.fn();

    await expect(readAchievementsForCurrentSession({
      accountKey: () => "default",
      session: () => null,
      isCurrent: () => current,
      read,
      wait: async () => { current = false; },
      waitAttempts: 2,
      waitMilliseconds: 0,
    })).resolves.toEqual({ kind: "stale" });

    expect(read).not.toHaveBeenCalled();
  });
});
