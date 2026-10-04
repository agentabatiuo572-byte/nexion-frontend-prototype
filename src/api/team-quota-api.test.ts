import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createTeamQuotaApi } from "./team-quota-api";

const valid = {
  source: "server", sourceEnvironment: "PRODUCTION", runId: "", generatedAt: "2026-08-15T00:00:00Z",
  facts: { rank: 5, directRefs: 0, directInvites: 5, activeDirect: 2, teamVolumeUSD: 150000 },
  tiers: [{ productId: "stellarbox-pro", quotaCode: "PRO", name: "Pro", price: 899, monthlyStock: 10,
    soldThisMonth: 2, unlockKind: "ALL", conditions: [{ kind: "rank", required: 5, current: 5 }],
    perks: ["100 NEX/day"], available: true }],
};

describe("team quota API", () => {
  it("accepts server-owned quota projection", async () => {
    const request = vi.fn().mockResolvedValue(valid);
    const api = createTeamQuotaApi({ request } as unknown as ApiClient);
    await expect(api.snapshot()).resolves.toMatchObject({ source: "server", tiers: [{ quotaCode: "PRO" }] });
    await expect(api.snapshot()).resolves.toMatchObject({ facts: { directInvites: 5, directRefs: 0 } });
  });

  it("rejects mock quota sources in remote mode", async () => {
    const request = vi.fn().mockResolvedValue({ ...valid, source: "mock", sourceEnvironment: "SANDBOX", runId: "run-123" });
    const api = createTeamQuotaApi({ request } as unknown as ApiClient);
    await expect(api.snapshot()).rejects.toMatchObject({ message: "TEAM_QUOTA_RESPONSE_INVALID" });
  });

  it("accepts development quota from the production authority rail", async () => {
    const request = vi.fn().mockResolvedValue(valid);
    const api = createTeamQuotaApi({ request } as unknown as ApiClient, "dev");

    await expect(api.snapshot()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
  });

  it("rejects a non-empty run id instead of exposing quota facts", async () => {
    const request = vi.fn().mockResolvedValue({ ...valid, runId: "development-run-stale" });
    const api = createTeamQuotaApi({ request } as unknown as ApiClient, "dev");

    await expect(api.snapshot()).rejects.toMatchObject({ message: "TEAM_QUOTA_RESPONSE_INVALID" });
  });
});
