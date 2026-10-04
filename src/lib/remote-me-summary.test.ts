import { describe, expect, it } from "vitest";
import { countRemoteComputeReceipts, summarizeRemoteAchievements } from "./remote-me-summary";

describe("remote Me summary", () => {
  it("counts only compute receipts for the Proof-of-Compute shortcut", () => {
    expect(countRemoteComputeReceipts(
      [{ recentTasks: [{ receiptNo: "TASK-1" }, { receiptNo: "TASK-2" }, { receiptNo: "TASK-1" }] }],
    )).toBe(2);
  });

  it("keeps the receipt count unavailable until every required projection is ready", () => {
    expect(countRemoteComputeReceipts(null)).toBeNull();
  });

  it("counts only canonical claimed or fired point milestones", () => {
    expect(summarizeRemoteAchievements({
      dailyMilestones: [
        { status: "CLAIMED" },
        { status: "LOCKED" },
      ],
      earningMilestones: [
        { status: "FIRED" },
        { status: "CLAIMABLE" },
      ],
      badgeAchievements: [
        { status: "UNLOCKED" },
        { status: "LOCKED" },
      ],
    })).toEqual({ unlocked: 3, total: 6 });
  });

  it("keeps achievements unavailable when the points projection is missing", () => {
    expect(summarizeRemoteAchievements(null)).toBeNull();
  });
});
