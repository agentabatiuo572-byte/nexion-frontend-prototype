import { describe, expect, it } from "vitest";
import { proofStreakFacts } from "./proof-streak";

describe("proof streak consumer", () => {
  it("uses the server current and longest streak in remote mode", () => {
    expect(proofStreakFacts(true, { currentStreak: 6, longestStreak: 14 }, 1, 2)).toEqual({
      current: 6,
      longest: 14,
      display: 14,
    });
  });

  it("keeps unavailable server facts unavailable instead of falling back to local state", () => {
    expect(proofStreakFacts(true, { currentStreak: null, longestStreak: null }, 9, 12)).toEqual({
      current: null,
      longest: null,
      display: null,
    });
  });

  it("preserves server zeroes as real streak values", () => {
    expect(proofStreakFacts(true, { currentStreak: 0, longestStreak: 0 }, 9, 12)).toEqual({
      current: 0,
      longest: 0,
      display: 0,
    });
  });
});
