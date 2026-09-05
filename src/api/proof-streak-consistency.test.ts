import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createProofApi } from "./proof-api";

const proof = {
  source: "server",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  generatedAt: "2026-08-19T00:00:00Z",
  serverTime: "2026-08-19T00:00:00Z",
  asOf: "2026-08-19",
  provenance: {
    source: "server",
    environment: "PRODUCTION",
    runId: "",
    timeZone: "Asia/Ho_Chi_Minh",
    streakRule: "consecutive business days",
    percentileRule: "canonical",
  },
  joinedAt: "2026-01-01T00:00:00Z",
  activeDays: 30,
  onlineDevices: 1,
  currentStreak: 5,
  longestStreak: 5,
  topPercentile: 20,
  earningsTotalUsdt: 100,
  referralCode: "NXPROOF2026",
  referral: { invitedCount: 0, lifetimeInviterNex: 0 },
  team: { totalMembers: 0, activeMembers: 0 },
  availability: { status: "READY" },
};

describe("proof streak consistency", () => {
  it("rejects a longest streak smaller than the current streak", async () => {
    const request = vi.fn().mockResolvedValue({ ...proof, longestStreak: 4 });
    const api = createProofApi({ request } as unknown as ApiClient);
    await expect(api.snapshot()).rejects.toMatchObject({ message: "PROOF_RESPONSE_INVALID" });
  });
});
