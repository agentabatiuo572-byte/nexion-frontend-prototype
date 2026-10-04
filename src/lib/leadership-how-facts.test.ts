import { describe, expect, it } from "vitest";
import { leadershipHowFacts, leadershipHowRanks } from "@/lib/leadership-how-facts";

describe("leadership How facts", () => {
  const snapshot = {
    injectRate: 0.07,
    unlockRank: 4,
    nextPayoutAt: "2026-09-13T23:59:00Z",
    distribution: [
      { vRank: 4, people: 2, votes: 3 },
      { vRank: 6, people: 1, votes: 12 },
    ],
  };

  it("derives qualification, rate and schedule from the live public snapshot", () => {
    const facts = leadershipHowFacts(snapshot);
    expect(facts.unlockRank).toBe(4);
    expect(facts.injectRatePct).toBeCloseTo(7);
    expect(facts.nextPayoutAt).toBe(snapshot.nextPayoutAt);
  });

  it("shows every eligible configured rank, including ranks without participants", () => {
    expect(leadershipHowRanks(snapshot, [0, 3, 4, 5, 6])).toEqual([4, 5, 6]);
  });
});
