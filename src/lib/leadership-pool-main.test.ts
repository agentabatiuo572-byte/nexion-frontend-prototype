import { describe, expect, it } from "vitest";
import { leadershipMainRows } from "./leadership-pool-main";

describe("remote leadership pool main rows", () => {
  it("marks the authenticated server rank instead of a stale local rank", () => {
    expect(leadershipMainRows({
      totalVotes: 100,
      distribution: [
        { vRank: 3, people: 2, votes: 10 },
        { vRank: 5, people: 1, votes: 20 },
      ],
    }, 5, [3, 5])).toEqual([
      { rank: 3, people: 2, votes: 10, sharePct: 20, isMine: false },
      { rank: 5, people: 1, votes: 20, sharePct: 20, isMine: true },
    ]);
  });
});
