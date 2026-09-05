import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createTeamNetworkApi } from "./team-network-api";

describe("team network API", () => {
  it("accepts a server-owned seven-level projection", async () => {
    const request = vi.fn().mockResolvedValue({
      totalMembers: 1, directMembers: 1, activeMembers: 1,
      monthVolumeUsdt: 12.5, lifetimeVolumeUsdt: null,
      members: [{ id: "42", name: "Member 42", avatarUrl: null, vRank: 1, layer: 1,
        leg: "A", joinedAt: "2026-08-13T00:00:00Z",
        monthVolumeUsdt: 12.5, lifetimeVolumeUsdt: null, status: "ACTIVE", region: "SG" }],
      source: "server", generatedAt: "2026-08-13T00:00:00Z",
    });
    const api = createTeamNetworkApi({ request } as unknown as ApiClient);
    await expect(api.snapshot()).resolves.toMatchObject({ totalMembers: 1, members: [{ leg: "A" }] });
  });

  it("rejects internal sponsor identity fields instead of carrying them into the App", async () => {
    const request = vi.fn().mockResolvedValue({
      totalMembers: 1, directMembers: 1, activeMembers: 1, monthVolumeUsdt: 0, lifetimeVolumeUsdt: null,
      members: [{ id: "42", name: "Member 42", avatarUrl: null, vRank: 1, layer: 1, leg: null,
        sponsorId: "7", joinedAt: "2026-08-13T00:00:00Z", monthVolumeUsdt: 0,
        lifetimeVolumeUsdt: null, status: "ACTIVE", region: null }], source: "server",
      generatedAt: "2026-08-13T00:00:00Z",
    });
    const api = createTeamNetworkApi({ request } as unknown as ApiClient);
    await expect(api.snapshot()).rejects.toMatchObject({ message: "TEAM_NETWORK_RESPONSE_INVALID" });
  });

  it("rejects inconsistent member counts", async () => {
    const request = vi.fn().mockResolvedValue({ totalMembers: 2, directMembers: 0, activeMembers: 0,
      monthVolumeUsdt: 0, lifetimeVolumeUsdt: 0, members: [], source: "server", generatedAt: "2026-08-13T00:00:00Z" });
    const api = createTeamNetworkApi({ request } as unknown as ApiClient);
    await expect(api.snapshot()).rejects.toMatchObject({ message: "TEAM_NETWORK_RESPONSE_INVALID" });
  });
});
