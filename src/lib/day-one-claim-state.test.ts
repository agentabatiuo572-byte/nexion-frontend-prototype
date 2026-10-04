import { describe, expect, it } from "vitest";
import type { CanonicalQuest } from "@/api/quest-api";
import { dayOneClaimState } from "./day-one-claim-state";

const now = Date.parse("2026-09-09T00:00:00Z");
const rows = (): CanonicalQuest[] => Array.from({ length: 6 }, (_, i) => ({
  questCode: `task-${i}`, name: `Task ${i}`, layer: "DAY_ONE", rewardNex: 0,
  status: "COMPLETED", category: "explore", actionRoute: "/pages/store/store",
  instanceKey: "DAY_ONE:20260908", eligibleFrom: "2026-09-08T00:00:00Z",
  eligibleUntil: "2026-09-11T00:00:00Z", eligible: true,
}));

describe("DayOne completion and explicit group claim", () => {
  it("uses the server-snapshotted member count instead of a fixed six-task policy", () => {
    const pair = rows().slice(0, 2);
    expect(dayOneClaimState(pair, 2, "SNAPSHOT", now)).toMatchObject({
      verifiable: true,
      claimCode: "task-0",
    });
    expect(dayOneClaimState(pair, 3, "SNAPSHOT", now).claimCode).toBeNull();
  });

  it("keeps legacy history visible but never infers a claimable group without snapshot metadata", () => {
    expect(dayOneClaimState(rows(), null, "LEGACY_UNVERIFIED", now)).toMatchObject({
      verifiable: false,
      claimCode: null,
    });
    expect(dayOneClaimState([], 0, "EMPTY", now)).toMatchObject({
      empty: true,
      verifiable: false,
      claimCode: null,
    });
  });

  it("distinguishes completed tasks from claimed rewards", () => {
    expect(dayOneClaimState(rows(), 6, "SNAPSHOT", now)).toMatchObject({ claimed: false, claimCode: "task-0" });
    expect(dayOneClaimState(rows(), 6, "SNAPSHOT", now).completedCodes).toHaveLength(6);
    expect(dayOneClaimState(rows().map(row => ({ ...row, status: "CLAIMED" })), 6, "SNAPSHOT", now))
      .toMatchObject({ claimed: true, claimCode: null });
  });
  it("does not let an inactive historical row prevent a valid current group", () => {
    const historical = { ...rows()[0], questCode: "old", eligible: false, status: "EXPIRED" as const };
    expect(dayOneClaimState([...rows(), historical], 6, "SNAPSHOT", now).claimCode).toBe("task-0");
    expect(dayOneClaimState([...rows(), { ...historical, status: "CLAIMED", instanceKey: "old-instance" }], 6, "SNAPSHOT", now).claimed).toBe(false);
  });
  it.each(["PENDING", "EXPIRED", "CLAIMED"] as const)("blocks partial groups containing %s", status => {
    const group = rows(); group[0].status = status;
    expect(dayOneClaimState(group, 6, "SNAPSHOT", now).claimCode).toBeNull();
  });
  it("rejects expired, future, malformed, duplicate and mixed-instance groups", () => {
    for (const patch of [
      { eligibleUntil: new Date(now).toISOString() }, { eligibleFrom: "2099-01-01" },
      { eligibleUntil: "bad" }, { instanceKey: "other" }, { questCode: "task-1" },
      { eligible: false },
    ]) {
      const group = rows(); Object.assign(group[0], patch);
      expect(dayOneClaimState(group, 6, "SNAPSHOT", now).claimCode).toBeNull();
    }
    expect(dayOneClaimState([], 6, "SNAPSHOT", now).claimCode).toBeNull();
    expect(dayOneClaimState(rows().slice(1), 6, "SNAPSHOT", now).claimCode).toBeNull();
    expect(dayOneClaimState([...rows(), { ...rows()[0], questCode: "extra" }], 6, "SNAPSHOT", now).claimCode).toBeNull();
  });
});
