import { afterEach, describe, expect, it, vi } from "vitest";
import { createNetworkRankApi } from "./network-rank-api";
import { advanceRuntimeRevision } from "./order-api";

afterEach(() => advanceRuntimeRevision(null));

describe("network rank api", () => {
  it("accepts a server rank with an explicitly unavailable 24h delta", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_user_device",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      serverCanonical: true,
      currentRank: 4,
      rankChange24h: null,
      snapshotAvailable: false,
      generatedAt: "2026-08-15T11:00:00Z",
    });
    await expect(createNetworkRankApi({ request } as never, "prod").snapshot()).resolves.toEqual({
      source: "nx_user_device",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      serverCanonical: true,
      currentRank: 4,
      rankChange24h: null,
      snapshotAvailable: false,
      generatedAt: "2026-08-15T11:00:00Z",
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/app/network/rank" });
  });

  it("rejects a delta that is not backed by a server snapshot", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_user_device",
      sourceEnvironment: "PRODUCTION",
      currentRank: 4,
      rankChange24h: 12,
      snapshotAvailable: false,
      generatedAt: "2026-08-15T11:00:00Z",
    });
    await expect(createNetworkRankApi({ request } as never, "prod").snapshot())
      .rejects.toMatchObject({ message: "NETWORK_RANK_RESPONSE_INVALID" });
  });

  it("rejects the removed run-scoped sandbox rank", async () => {
    advanceRuntimeRevision("rank-run-20260819");
    const request = vi.fn().mockResolvedValue({
      source: "nx_user_device", sourceEnvironment: "SANDBOX", runId: "rank-run-20260819",
      serverCanonical: true, currentRank: null, rankChange24h: null, snapshotAvailable: false,
      generatedAt: "2026-08-19T11:00:00Z",
    });
    await expect(createNetworkRankApi({ request } as never, "dev").snapshot())
      .rejects.toMatchObject({ message: "NETWORK_RANK_RESPONSE_INVALID" });
  });

  it("development accepts canonical rank data without a sandbox run", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_user_device", sourceEnvironment: "PRODUCTION", runId: "",
      serverCanonical: true, currentRank: null, rankChange24h: null, snapshotAvailable: false,
      generatedAt: "2026-08-19T11:00:00Z",
    });
    await expect(createNetworkRankApi({ request } as never, "dev").snapshot()).resolves.toMatchObject({
      sourceEnvironment: "PRODUCTION", runId: "", currentRank: null,
    });
  });

  it("rejects a late sandbox response after the catalogue switches RunID", async () => {
    advanceRuntimeRevision("rank-run-20260819");
    let release!: (value: unknown) => void;
    const request = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const pending = createNetworkRankApi({ request } as never, "dev").snapshot();
    advanceRuntimeRevision("rank-run-20260820");
    release({
      source: "nx_user_device", sourceEnvironment: "SANDBOX", runId: "rank-run-20260819",
      serverCanonical: true, currentRank: 4, rankChange24h: null, snapshotAvailable: false,
      generatedAt: "2026-08-19T11:00:00Z",
    });
    await expect(pending).rejects.toMatchObject({ message: "NETWORK_RANK_RESPONSE_INVALID" });
  });
});
