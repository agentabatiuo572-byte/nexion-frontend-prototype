import { describe, expect, it } from "vitest";
import { profileVRankProjection } from "./profile-vrank-display";

describe("profile V-rank projection", () => {
  const ranks = [
    { v: 4, title: "Commander", cnTitle: "指挥官" },
    { v: 5, title: "Wing Leader", cnTitle: "翼领" },
  ];

  it("keeps a remote authority gap unknown rather than treating it as a visitor rank", () => {
    expect(profileVRankProjection(false, 0, ranks)).toBeNull();
  });

  it("uses the current and next configured V-rank names", () => {
    expect(profileVRankProjection(true, 4, ranks)).toEqual({
      current: ranks[0],
      next: ranks[1],
    });
  });
});
