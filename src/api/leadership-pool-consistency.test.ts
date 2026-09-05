import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createTeamInsightsApi } from "./team-insights-api";

function response(overrides: Record<string, unknown> = {}) {
  return {
    source: "server",
    serverCanonical: true,
    sourceEnvironment: "PRODUCTION",
    runId: "",
    currentWeekPoolUSDT: 1_000,
    myRank: 5,
    myVotes: 20,
    totalVotes: 40,
    mySharePct: 0.5,
    projectedPayoutUSDT: 500,
    distribution: [
      { vRank: 3, people: 2, votes: 10 },
      { vRank: 5, people: 1, votes: 20 },
    ],
    history: [],
    nextPayoutAt: "2026-08-24T00:00:00Z",
    ...overrides,
  };
}

async function read(value: unknown) {
  const request = vi.fn().mockResolvedValue(value);
  return createTeamInsightsApi({ request } as unknown as ApiClient).leadershipPool();
}

describe("leadership pool server-fact consistency", () => {
  it("accepts an internally consistent canonical snapshot", async () => {
    await expect(read(response())).resolves.toMatchObject({
      myRank: 5,
      myVotes: 20,
      totalVotes: 40,
      mySharePct: 0.5,
      projectedPayoutUSDT: 500,
    });
  });

  it.each([
    ["duplicate rank", { distribution: [{ vRank: 5, people: 1, votes: 20 }, { vRank: 5, people: 1, votes: 20 }] }],
    ["rank above the V ladder", { distribution: [{ vRank: 13, people: 4, votes: 10 }] }],
    ["wrong total votes", { totalVotes: 41 }],
    ["wrong member votes", { myVotes: 10 }],
    ["wrong share", { mySharePct: 0.25 }],
    ["wrong payout", { projectedPayoutUSDT: 499 }],
  ])("rejects %s instead of rendering contradictory data", async (_label, overrides) => {
    await expect(read(response(overrides))).rejects.toMatchObject({
      message: "TEAM_INSIGHTS_RESPONSE_INVALID",
    });
  });
});
