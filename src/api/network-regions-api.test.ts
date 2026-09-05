import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createNetworkRegionsApi } from "./network-regions-api";

describe("network regions API", () => {
  it("accepts a server-owned aggregate projection", async () => {
    const request = vi.fn().mockResolvedValue({
      activeNodes: 2,
      activeJobs: 1,
      countryCount: 1,
      regions: [{
        id: "ap-southeast-1", displayName: "Singapore", location: "Singapore",
        activeNodes: 2, activeJobs: 1, jobsPerHour: 8,
        latitude: 1.35, longitude: 103.82, isUserRegion: true,
      }],
      source: "server",
      generatedAt: "2026-08-13T00:00:00Z",
    });
    const api = createNetworkRegionsApi({ request } as unknown as ApiClient);
    await expect(api.list()).resolves.toMatchObject({
      activeNodes: 2,
      regions: [{ id: "ap-southeast-1", isUserRegion: true }],
      source: "server",
    });
  });

  it("rejects local or inconsistent totals", async () => {
    const request = vi.fn().mockResolvedValue({
      activeNodes: 9, activeJobs: 0, regions: [], source: "local", generatedAt: "2026-08-13T00:00:00Z",
    });
    const api = createNetworkRegionsApi({ request } as unknown as ApiClient);
    await expect(api.list()).rejects.toMatchObject({ message: "NETWORK_REGIONS_RESPONSE_INVALID" });
  });

  it("allows one account to own active devices in multiple regions", async () => {
    const request = vi.fn().mockResolvedValue({
      activeNodes: 2,
      activeJobs: 0,
      countryCount: 2,
      regions: [
        { id: "sg", displayName: "Singapore", location: "Singapore", activeNodes: 1, activeJobs: 0,
          jobsPerHour: 1, latitude: 1.35, longitude: 103.82, isUserRegion: true },
        { id: "tyo", displayName: "Tokyo", location: "Tokyo", activeNodes: 1, activeJobs: 0,
          jobsPerHour: 1, latitude: 35.68, longitude: 139.69, isUserRegion: true },
      ],
      source: "server",
      generatedAt: "2026-08-13T00:00:00Z",
    });
    const api = createNetworkRegionsApi({ request } as unknown as ApiClient);
    await expect(api.list()).resolves.toMatchObject({ regions: [{ isUserRegion: true }, { isUserRegion: true }] });
  });
});
