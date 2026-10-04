import { describe, expect, it, vi } from "vitest";
import { reconcileProfileEdit, saveProfileAndClaimQuest } from "./profile-save-flow";

describe("profile save authority flow", () => {
  it("replaces an untouched edit buffer with the latest server nickname", () => {
    expect(reconcileProfileEdit("Old Name 10", "Old Name 10", "New Name 11"))
      .toBe("New Name 11");
  });

  it("preserves a user selection while advancing the authoritative nickname", () => {
    expect(reconcileProfileEdit("Old Name 10", "Chosen Name 12", "New Name 11"))
      .toBe("Chosen Name 12");
  });

  it("treats quest completion as retryable after the nickname is already saved", async () => {
    const saveNickname = vi.fn().mockResolvedValue(true);
    const claimSetupProfileQuest = vi.fn().mockResolvedValue(false);

    await expect(saveProfileAndClaimQuest(saveNickname, claimSetupProfileQuest))
      .resolves.toEqual({ saved: true, questPending: true });
  });

  it("still rejects when the authoritative nickname mutation itself fails", async () => {
    const failure = new Error("USER_PROFILE_VERSION_CONFLICT");
    const saveNickname = vi.fn().mockRejectedValue(failure);
    const claimSetupProfileQuest = vi.fn();

    await expect(saveProfileAndClaimQuest(saveNickname, claimSetupProfileQuest)).rejects.toBe(failure);
    expect(claimSetupProfileQuest).not.toHaveBeenCalled();
  });
});
