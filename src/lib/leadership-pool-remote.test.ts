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
    }, [3, 4], new Map([[3, 10], [4, 20]]))).toEqual([
      { rank: 3, votes: 10, sharePct: 10 },
      { rank: 4, votes: 20, sharePct: 20 },
    ]);
  });

  it("uses configured vote weight without inventing an actual share", () => {
    expect(leadershipHowRows({ totalVotes: 0, distribution: [] }, [3, 12], new Map([[3, 1], [12, 512]]))).toEqual([
      { rank: 3, votes: 1, sharePct: null },
      { rank: 12, votes: 512, sharePct: null },
    ]);
  });
});
