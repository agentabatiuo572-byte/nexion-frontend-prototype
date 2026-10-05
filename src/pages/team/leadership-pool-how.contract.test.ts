import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./leadership-pool-how.vue", { query: "?raw", import: "default", eager: true })["./leadership-pool-how.vue"] ?? "") as string;

describe("leadership How server facts", () => {
  it("uses live eligibility and payout facts without a rank-weight table", () => {
    expect(source).toContain("leadershipHowFacts");
    expect(source).toContain("rank: facts.value.unlockRank");
    expect(source).toContain("new Date(facts.value.nextPayoutAt)");
    expect(source).not.toMatch(/voteRows|V_VOTES|leadershipHowRows|leadershipHowRanks|injectRatePct/);
    expect(source).not.toContain("[3, 4, 5, 6, 7, 8, 9, 10, 11, 12]");
    expect(source).toContain("leadershipPoolFailureState");
  });

  it("shows explicit HOLD with an available retry", () => {
    expect(source).toContain("remoteState === 'hold' ? t.pool.settlementHold");
    expect(source).toContain("remoteState === 'hold' || remoteState === 'error' || vState.remoteError");
    expect(source).toContain("@click=\"loadRemotePool\"");
  });
});
