import { describe, expect, it, vi } from "vitest";
import { createNetworkRankApi } from "./network-rank-api";

describe("network rank api", () => {
  it("accepts a server rank with an explicitly unavailable 24h delta", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_user_device",
      sourceEnvironment: "PRODUCTION",
      currentRank: 4,
      rankChange24h: null,
      snapshotAvailable: false,
      generatedAt: "2026-08-15T11:00:00Z",
    });
    await expect(createNetworkRankApi({ request } as never).snapshot()).resolves.toEqual({
      source: "nx_user_device",
      sourceEnvironment: "PRODUCTION",
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
    await expect(createNetworkRankApi({ request } as never).snapshot())
      .rejects.toMatchObject({ message: "NETWORK_RANK_RESPONSE_INVALID" });
  });
});
