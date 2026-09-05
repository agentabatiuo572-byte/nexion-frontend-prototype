import { describe, expect, it } from "vitest";
import { leadershipHowRows } from "./leadership-pool-remote";

describe("remote leadership pool how rows", () => {
  it("derives per-rank votes and shares from the server distribution", () => {
    expect(leadershipHowRows({
      totalVotes: 100,
      distribution: [
        { vRank: 3, people: 2, votes: 10 },
        { vRank: 4, people: 1, votes: 20 },
      ],
    }, [3, 4])).toEqual([
      { rank: 3, votes: 10, sharePct: 10 },
      { rank: 4, votes: 20, sharePct: 20 },
    ]);
  });

  it("does not invent a row value when the server omits a rank or total", () => {
    expect(leadershipHowRows({ totalVotes: 0, distribution: [] }, [3])).toEqual([
      { rank: 3, votes: null, sharePct: null },
    ]);
  });
});
