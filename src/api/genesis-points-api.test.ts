import { describe, expect, it, vi } from "vitest";
import { createGenesisPointsApi } from "./genesis-points-api";

describe("genesis points api", () => {
  it("reads the account-isolated server projection", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_genesis_holding",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      pointsPerHolding: 1000,
      leaderboard: [{ rank: 1, handle: "Ali***", points: 3000, holdings: 3 }],
      currentUser: { rank: 1, points: 3000, holdings: 3 },
      generatedAt: "2026-08-15T11:00:00Z",
    });

    await expect(createGenesisPointsApi({ request } as never, "dev").projection()).resolves.toMatchObject({
      sourceEnvironment: "PRODUCTION",
      currentUser: { rank: 1, points: 3000 },
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/genesis/points" });
  });

  it("rejects an unscoped or malformed projection instead of inventing a rank", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "localStorage",
      sourceEnvironment: "PRODUCTION",
      leaderboard: [],
      currentUser: { rank: 1, points: 1000, holdings: 1 },
    });
    await expect(createGenesisPointsApi({ request } as never).projection())
      .rejects.toMatchObject({ message: "GENESIS_POINTS_RESPONSE_INVALID" });
  });
});
