import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createTeamNetworkApi } from "./team-network-api";

const PRODUCTION_PROOF = { source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true };

function page(startId: number, size: number, nextCursor: string | null = null) {
  const members = Array.from({ length: size }, (_, index) => {
    const id = String(startId + index);
    return { id, name: `Member ${id}`, avatarUrl: null, vRank: 1, layer: 1,
      leg: "A", joinedAt: "2026-08-13T00:00:00Z", monthVolumeUsdt: 1,
      lifetimeVolumeUsdt: null, status: "ACTIVE", region: "SG" };
  });
  return { totalMembers: size, directMembers: size, activeMembers: size,
    monthVolumeUsdt: size, lifetimeVolumeUsdt: null, members, nextCursor,
    ...PRODUCTION_PROOF, generatedAt: "2026-08-13T00:00:00Z" };
}

describe("team network API", () => {
  it("accepts a server-owned seven-level projection", async () => {
    const request = vi.fn().mockResolvedValue({
      totalMembers: 1, directMembers: 1, activeMembers: 1,
      monthVolumeUsdt: 12.5, lifetimeVolumeUsdt: null,
      members: [{ id: "42", name: "Member 42", avatarUrl: null, vRank: 1, layer: 1,
        leg: "A", joinedAt: "2026-08-13T00:00:00Z",
        monthVolumeUsdt: 12.5, lifetimeVolumeUsdt: null, status: "ACTIVE", region: "SG" }],
      ...PRODUCTION_PROOF, generatedAt: "2026-08-13T00:00:00Z",
    });
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "prod");
    await expect(api.snapshot()).resolves.toMatchObject({ totalMembers: 1, members: [{ leg: "A" }] });
  });

  it("accepts the Java production authority rail in development mode", async () => {
    const request = vi.fn().mockResolvedValue({
      totalMembers: 0, directMembers: 0, activeMembers: 0, monthVolumeUsdt: 0, lifetimeVolumeUsdt: null,
      members: [], ...PRODUCTION_PROOF, generatedAt: "2026-08-13T00:00:00Z",
    });
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "dev");
    await expect(api.snapshot()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
  });

  it("keeps a zero-member page empty", async () => {
    const request = vi.fn().mockResolvedValue(page(1, 0));
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "prod");

    await expect(api.snapshot()).resolves.toMatchObject({ totalMembers: 0, members: [], nextCursor: null });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps a single five-hundred-member page intact", async () => {
    const request = vi.fn().mockResolvedValue(page(1, 500));
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "prod");

    await expect(api.snapshot()).resolves.toMatchObject({ totalMembers: 500, directMembers: 500, activeMembers: 500 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("merges five-hundred-and-one members across pages", async () => {
    const request = vi.fn().mockResolvedValueOnce(page(1, 500, "500")).mockResolvedValueOnce(page(501, 1));
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "prod");

    await expect(api.snapshot()).resolves.toMatchObject({ totalMembers: 501, directMembers: 501, activeMembers: 501, nextCursor: null });
    expect(request).toHaveBeenNthCalledWith(1, { path: "/api/app/team/network" });
    expect(request).toHaveBeenNthCalledWith(2, { path: "/api/app/team/network?afterId=500" });
  });

  it("merges one-thousand-and-one members across three pages", async () => {
    const request = vi.fn().mockResolvedValueOnce(page(1, 500, "500"))
      .mockResolvedValueOnce(page(501, 500, "1000")).mockResolvedValueOnce(page(1001, 1));
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "prod");

    const result = await api.snapshot();
    expect(result).toMatchObject({ totalMembers: 1001, directMembers: 1001, activeMembers: 1001, nextCursor: null });
    expect(result.members.map((member) => member.id)).toHaveLength(1001);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("rejects a non-advancing cursor", async () => {
    const request = vi.fn().mockResolvedValueOnce(page(1, 1, "1")).mockResolvedValueOnce(page(2, 1, "1"));
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "prod");

    await expect(api.snapshot()).rejects.toMatchObject({ message: "TEAM_NETWORK_RESPONSE_INVALID" });
  });

  it("rejects duplicated members across pages", async () => {
    const request = vi.fn().mockResolvedValueOnce(page(1, 1, "1")).mockResolvedValueOnce(page(1, 1));
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "prod");

    await expect(api.snapshot()).rejects.toMatchObject({ message: "TEAM_NETWORK_RESPONSE_INVALID" });
  });

  it("rejects a page whose environment changes during pagination", async () => {
    const request = vi.fn().mockResolvedValueOnce(page(1, 1, "1")).mockResolvedValueOnce({
      ...page(2, 1), sourceEnvironment: "SANDBOX", runId: "TEAM-RUN-20260816",
    });
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "prod");

    await expect(api.snapshot()).rejects.toMatchObject({ message: "TEAM_NETWORK_RESPONSE_INVALID" });
  });

  it("rejects missing proof and retired sandbox responses", async () => {
    const payload = {
      totalMembers: 0, directMembers: 0, activeMembers: 0, monthVolumeUsdt: 0, lifetimeVolumeUsdt: null,
      members: [], source: "server", generatedAt: "2026-08-13T00:00:00Z",
    };
    const missingProof = createTeamNetworkApi({ request: vi.fn().mockResolvedValue(payload) } as unknown as ApiClient, "dev");
    await expect(missingProof.snapshot()).rejects.toMatchObject({ message: "TEAM_NETWORK_RESPONSE_INVALID" });

    const sandboxProof = createTeamNetworkApi({ request: vi.fn().mockResolvedValue({ ...payload,
      sourceEnvironment: "SANDBOX", runId: "TEAM-RUN-20260815", serverCanonical: true }) } as unknown as ApiClient, "dev");
    await expect(sandboxProof.snapshot()).rejects.toMatchObject({ message: "TEAM_NETWORK_RESPONSE_INVALID" });
  });

  it("rejects internal sponsor identity fields instead of carrying them into the App", async () => {
    const request = vi.fn().mockResolvedValue({
      totalMembers: 1, directMembers: 1, activeMembers: 1, monthVolumeUsdt: 0, lifetimeVolumeUsdt: null,
      members: [{ id: "42", name: "Member 42", avatarUrl: null, vRank: 1, layer: 1, leg: null,
        sponsorId: "7", joinedAt: "2026-08-13T00:00:00Z", monthVolumeUsdt: 0,
        lifetimeVolumeUsdt: null, status: "ACTIVE", region: null }],
      ...PRODUCTION_PROOF, generatedAt: "2026-08-13T00:00:00Z",
    });
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "prod");
    await expect(api.snapshot()).rejects.toMatchObject({ message: "TEAM_NETWORK_RESPONSE_INVALID" });
  });

  it("rejects inconsistent member counts", async () => {
    const request = vi.fn().mockResolvedValue({ totalMembers: 2, directMembers: 0, activeMembers: 0,
      monthVolumeUsdt: 0, lifetimeVolumeUsdt: 0, members: [], ...PRODUCTION_PROOF, generatedAt: "2026-08-13T00:00:00Z" });
    const api = createTeamNetworkApi({ request } as unknown as ApiClient, "prod");
    await expect(api.snapshot()).rejects.toMatchObject({ message: "TEAM_NETWORK_RESPONSE_INVALID" });
  });
});
