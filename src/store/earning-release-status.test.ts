import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ earningsReleaseApi: { status: vi.fn() } }));
vi.mock("@/api/runtime", () => runtime);
vi.mock("@/api/order-api", () => ({
  captureRuntimeRevision: () => ({ runId: "test", epoch: 1 }),
  isCurrentRuntimeRevision: () => true,
}));

const release = await import("./earning-release");

beforeEach(() => {
  vi.clearAllMocks();
  release.bindEarningsReleaseAccount("user:1001");
});

describe("earnings-release status", () => {
  it("clears a same-account snapshot when its later read fails", async () => {
    const snapshot = { clusterRestricted: false, buckets: { pending_review: 12, bonus_locked: 3 } };
    runtime.earningsReleaseApi.status
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error("release unavailable"));

    await release.refreshEarningsReleaseStatus("user:1001");
    await expect(release.refreshEarningsReleaseStatus("user:1001")).rejects.toThrow("release unavailable");

    expect(release.earningsReleaseSnapshot.value).toBeNull();
    expect(release.earningsReleaseHasSnapshot.value).toBe(false);
    expect(release.earningsReleaseStatus.value).toBe("error");
  });

  it("leaves the initial failing read unknown", async () => {
    runtime.earningsReleaseApi.status.mockRejectedValueOnce(new Error("release unavailable"));

    await expect(release.refreshEarningsReleaseStatus("user:1001")).rejects.toThrow("release unavailable");

    expect(release.earningsReleaseSnapshot.value).toBeNull();
    expect(release.earningsReleaseHasSnapshot.value).toBe(false);
    expect(release.earningsReleaseStatus.value).toBe("error");
  });

  it("rejects an old-account caller before it can replace the current account state", async () => {
    const currentSnapshot = { clusterRestricted: false, buckets: { pending_review: 4, bonus_locked: 1 } };
    const refreshedSnapshot = { clusterRestricted: false, buckets: { pending_review: 5, bonus_locked: 2 } };
    runtime.earningsReleaseApi.status
      .mockResolvedValueOnce(currentSnapshot)
      .mockResolvedValueOnce(refreshedSnapshot);

    await release.refreshEarningsReleaseStatus("user:1001");
    await expect(release.refreshEarningsReleaseStatus("user:2002")).rejects.toThrow("EARNINGS_RELEASE_ACCOUNT_CHANGED");

    expect(runtime.earningsReleaseApi.status).toHaveBeenCalledTimes(1);
    expect(release.earningsReleaseSnapshot.value).toEqual(currentSnapshot);
    expect(release.earningsReleaseStatus.value).toBe("ready");

    await release.refreshEarningsReleaseStatus("user:1001");
    expect(release.earningsReleaseSnapshot.value).toEqual(refreshedSnapshot);
    expect(release.earningsReleaseStatus.value).toBe("ready");
  });
});
