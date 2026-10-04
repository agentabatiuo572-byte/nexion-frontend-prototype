import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createProofApi } from "./proof-api";

const valid = {
  source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, generatedAt: "2026-08-15T00:00:00Z",
  serverTime: "2026-08-15T00:00:00Z", asOf: "2026-08-15",
  provenance: { source: "server", environment: "PRODUCTION", runId: "", timeZone: "Asia/Ho_Chi_Minh", streakRule: "rule", percentileRule: "rule" },
  joinedAt: "2026-01-01T00:00:00Z", activeDays: 100, onlineDevices: 2, currentStreak: 3, longestStreak: 7, topPercentile: 7,
  earningsTotalUsdt: 123.45, referralCode: "NXAB12CD34EF",
  referral: { invitedCount: 4, lifetimeInviterNex: 50 }, team: { totalMembers: 9, activeMembers: 6 },
  availability: { status: "READY" },
};

describe("proof API", () => {
  it("accepts the server proof projection", async () => {
    const request = vi.fn().mockResolvedValue(valid);
    const api = createProofApi({ request } as unknown as ApiClient);
    await expect(api.snapshot()).resolves.toMatchObject({ topPercentile: 7, earningsTotalUsdt: 123.45 });
  });

  it("rejects fixed or client-only proof fields", async () => {
    const request = vi.fn().mockResolvedValue({ ...valid, topPct: 35 });
    const api = createProofApi({ request } as unknown as ApiClient);
    await expect(api.snapshot()).rejects.toMatchObject({ message: "PROOF_RESPONSE_INVALID" });
  });

  it("rejects malformed or stale authority metadata and keeps unavailable facts null", async () => {
    const request = vi.fn().mockResolvedValue({ ...valid, serverTime: "not-a-date", currentStreak: null, longestStreak: null, topPercentile: null });
    const api = createProofApi({ request } as unknown as ApiClient);
    await expect(api.snapshot()).rejects.toMatchObject({ message: "PROOF_RESPONSE_INVALID" });
  });

  it("rejects a proof envelope without the server canonical marker", async () => {
    const { serverCanonical: _marker, ...missing } = valid;
    await expect(createProofApi({ request: vi.fn().mockResolvedValue(missing) } as unknown as ApiClient).snapshot())
      .rejects.toMatchObject({ message: "PROOF_RESPONSE_INVALID" });
    await expect(createProofApi({ request: vi.fn().mockResolvedValue({ ...valid, serverCanonical: false }) } as unknown as ApiClient).snapshot())
      .rejects.toMatchObject({ message: "PROOF_RESPONSE_INVALID" });
  });

  it("accepts a server-authoritative empty development projection without inventing team values", async () => {
    const request = vi.fn().mockResolvedValue({
      ...valid,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      provenance: { ...valid.provenance, environment: "PRODUCTION", runId: "" },
      serverTime: "2026-08-17T05:00:00Z",
      asOf: "2026-08-17",
      earningsTotalUsdt: null,
      onlineDevices: null,
      currentStreak: null,
      longestStreak: null,
      topPercentile: null,
      team: { totalMembers: null, activeMembers: null },
      availability: { status: "EMPTY", earnings: "UNAVAILABLE", team: "UNAVAILABLE" },
    });
    const api = createProofApi({ request } as unknown as ApiClient, "dev");
    await expect(api.snapshot()).resolves.toMatchObject({ earningsTotalUsdt: null, team: { totalMembers: null } });
  });
});
