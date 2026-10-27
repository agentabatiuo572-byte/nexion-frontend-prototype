import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./leadership-pool-how.vue", { query: "?raw", import: "default", eager: true })["./leadership-pool-how.vue"] ?? "") as string;

describe("leadership How server facts", () => {
  it("uses live eligibility, published weights and current participation without invented funding rules", () => {
    expect(source).toContain("leadershipHowFacts");
    expect(source).toContain("rank: facts.value.unlockRank");
    expect(source).toContain("formatDisplayDateTime(facts.value.nextPayoutAt, locale.code, true)");
    expect(source).toContain("configuredVoteRows");
    expect(source).toContain("row.leadershipVotes");
    expect(source).toContain("remotePool.value?.distribution");
    expect(source).not.toMatch(/V_VOTES|injectRatePct/);
    expect(source).not.toContain("[3, 4, 5, 6, 7, 8, 9, 10, 11, 12]");
    expect(source).toContain("leadershipPoolFailureState");
  });

  it("shows explicit HOLD with an available retry", () => {
    expect(source).toContain("remoteState === 'hold' ? t.pool.settlementHold");
    expect(source).toContain("remoteState === 'hold' || remoteState === 'error' || vState.remoteError");
    expect(source).toContain("@click=\"loadRemotePool\"");
  });
});
