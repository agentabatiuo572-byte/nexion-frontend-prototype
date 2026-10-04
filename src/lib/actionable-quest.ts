/** History remains available in the snapshot, but must not become an action or reward promise. */
export function isCurrentQuest(quest: {
  status: string;
  eligible: boolean;
  eligibleFrom: string;
  eligibleUntil: string;
}, now = Date.now()): boolean {
  return (quest.eligible || quest.status === "CLAIMED") && ["PENDING", "COMPLETED", "CLAIMABLE", "CLAIMED"].includes(quest.status)
    && Date.parse(quest.eligibleFrom) <= now && now < Date.parse(quest.eligibleUntil);
}

export function isActionableQuest(quest: Parameters<typeof isCurrentQuest>[0], now = Date.now()): boolean {
  return quest.status !== "CLAIMED" && isCurrentQuest(quest, now);
}
