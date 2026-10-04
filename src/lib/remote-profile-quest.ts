import type { CanonicalQuest } from "@/api/quest-api";

export interface RemoteQuestClaimPort {
  remoteQuests: ReadonlyArray<Pick<CanonicalQuest, "questCode" | "actionRoute" | "status">>;
  claimRemote(id: string): Promise<boolean>;
}

/**
 * Profile setup is completed by the explicit server-confirmed save flow. The
 * quest store owns the claim and its authority refresh; this adapter keeps the
 * page from ever reaching for markComplete or a local reward table.
 */
export async function claimSetupProfileQuest(port: RemoteQuestClaimPort): Promise<boolean> {
  const quest = port.remoteQuests.find((candidate) => (
    candidate.actionRoute === "/pages/me/profile" && candidate.status !== "CLAIMED"
  ));
  // A paused/deleted profile mission is not a profile-save failure. With no
  // active server projection there is simply no task reward to claim.
  if (!quest) return true;
  return port.claimRemote(quest.questCode);
}
