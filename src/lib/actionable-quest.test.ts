import { describe, it, expect } from "vitest";
import { isActionableQuest, isCurrentQuest } from "./actionable-quest";

describe("current actionable quest selection", () => {
  const now = Date.parse("2026-09-05T12:00:00Z");
  const active = { status: "PENDING", eligible: true, eligibleFrom: "2026-09-01T00:00:00Z", eligibleUntil: "2026-09-08T00:00:00Z" };
  it("retains current pending and claimable quests", () => {
    for (const status of ["PENDING", "COMPLETED", "CLAIMABLE"]) expect(isActionableQuest({ ...active, status }, now)).toBe(true);
  });
  it("retains this week's claimed receipt without counting it as actionable", () => {
    expect(isCurrentQuest({ ...active, status: "CLAIMED", eligible: false }, now)).toBe(true);
    expect(isActionableQuest({ ...active, status: "CLAIMED", eligible: false }, now)).toBe(false);
  });
  it("excludes history, future, expired and malformed windows", () => {
    for (const patch of [{ status: "EXPIRED" }, { status: "CLAIMED" }, { eligible: false },
      { eligibleFrom: "2026-09-06T00:00:00Z" }, { eligibleUntil: "2026-09-05T12:00:00Z" }, { eligibleUntil: "invalid" }]) {
      expect(isActionableQuest({ ...active, ...patch }, now)).toBe(false);
    }
  });
});
