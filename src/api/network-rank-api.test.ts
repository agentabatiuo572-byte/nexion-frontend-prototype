import { afterEach, describe, expect, it, vi } from "vitest";
import { createNetworkRankApi } from "./network-rank-api";
import { advanceRuntimeRevision } from "./order-api";

afterEach(() => advanceRuntimeRevision(null));
const snapshot = () => ({ source: "SIMULATED_DEVICE_DISTRIBUTION", sourceEnvironment: "PRODUCTION", runId: "",
  serverCanonical: true, state: "ranked", currentRank: 4, population: 100, deviceTops: 31.3,
  modelVersion: 2, generatedAt: "2026-10-25T11:00:00Z" });

describe("estimated device rank api", () => {
  it.each(["dev", "prod"] as const)("accepts the canonical estimate in %s using the read-only route", async mode => {
    const request = vi.fn().mockResolvedValue(snapshot());
    await expect(createNetworkRankApi({ request } as never, mode).snapshot()).resolves.toEqual(snapshot());
    expect(request).toHaveBeenCalledWith({ path: "/api/app/network/device-rank" });
  });
  it.each(["unranked", "disabled", "unavailable"])("preserves explicit %s without inventing a rank", async state => {
    const result = { ...snapshot(), state, currentRank: null, population: null, deviceTops: null, modelVersion: 0 };
    const request = vi.fn().mockResolvedValue(result);
    await expect(createNetworkRankApi({ request } as never).snapshot()).resolves.toEqual(result);
  });
  it.each([
    { source: "nx_user_device" }, { serverCanonical: false }, { sourceEnvironment: "SANDBOX", runId: "other-run" },
    { runId: "other-run" }, { state: "unknown" }, { currentRank: 0 }, { currentRank: 101 }, { currentRank: 1.5 },
    { currentRank: null }, { population: null }, { population: -1 }, { population: 0 }, { population: Number.MAX_SAFE_INTEGER + 1 },
    { deviceTops: null }, { deviceTops: 0 }, { deviceTops: -1 }, { deviceTops: NaN }, { deviceTops: Infinity },
    { modelVersion: null }, { modelVersion: -1 }, { state: "disabled", currentRank: 4 }, { generatedAt: "bad-date" },
  ])("rejects incompatible source or impossible estimates: %j", async patch => {
    const request = vi.fn().mockResolvedValue({ ...snapshot(), ...patch });
    await expect(createNetworkRankApi({ request } as never).snapshot())
      .rejects.toMatchObject({ message: "NETWORK_RANK_RESPONSE_INVALID" });
  });
  it("accepts unranked zero compute and boundary first/last placement", async () => {
    for (const patch of [{ state: "unranked", currentRank: null, deviceTops: 0 }, { currentRank: 1 }, { currentRank: 100 }]) {
      const request = vi.fn().mockResolvedValue({ ...snapshot(), ...patch });
      await expect(createNetworkRankApi({ request } as never).snapshot()).resolves.toMatchObject(patch);
    }
  });
});
