import { describe, expect, it, vi } from "vitest";
import { claimSetupProfileQuest } from "./remote-profile-quest";

describe("remote profile quest completion", () => {
  it("claims setup_profile through the quest authority after save", async () => {
    const claimRemote = vi.fn().mockResolvedValue(true);
    await expect(claimSetupProfileQuest({
      remoteQuests: [{ questCode: "pc-authored-profile-task", actionRoute: "/pages/me/profile", status: "PENDING" }],
      claimRemote,
    })).resolves.toBe(true);
    expect(claimRemote).toHaveBeenCalledWith("pc-authored-profile-task");
  });

  it("keeps a failed claim retryable instead of marking it complete locally", async () => {
    const claimRemote = vi.fn().mockResolvedValue(false);
    await expect(claimSetupProfileQuest({
      remoteQuests: [{ questCode: "pc-authored-profile-task", actionRoute: "/pages/me/profile", status: "PENDING" }],
      claimRemote,
    })).resolves.toBe(false);
  });

  it("does not invent a task code when PC has no active profile mission", async () => {
    const claimRemote = vi.fn();
    await expect(claimSetupProfileQuest({ remoteQuests: [], claimRemote })).resolves.toBe(true);
    expect(claimRemote).not.toHaveBeenCalled();
  });
});
