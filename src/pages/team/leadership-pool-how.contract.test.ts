import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./leadership-pool-how.vue", { query: "?raw", import: "default", eager: true })["./leadership-pool-how.vue"] ?? "") as string;

describe("leadership How server facts", () => {
  it("uses live F4 facts and never restores a fixed V3 row", () => {
    expect(source).toContain("leadershipHowFacts");
    expect(source).toContain("leadershipHowRanks");
    expect(source).not.toContain("[3, 4, 5, 6, 7, 8, 9, 10, 11, 12]");
    expect(source).toContain("leadershipPoolFailureState");
  });

  it("shows explicit HOLD with an available retry", () => {
    expect(source).toContain("remoteState === 'hold' ? t.pool.settlementHold");
    expect(source).toContain("remoteState === 'hold' || remoteState === 'error' || vState.remoteError");
    expect(source).toContain("@click=\"loadRemotePool\"");
  });
});
