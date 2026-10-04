export interface RemoteDeviceProjection {
  recentTasks?: readonly { receiptNo?: string | null }[] | null;
}

export interface RemoteAchievementProjection {
  status?: string | null;
}

export interface RemotePointsProjection {
  dailyMilestones?: readonly RemoteAchievementProjection[] | null;
  earningMilestones?: readonly RemoteAchievementProjection[] | null;
  badgeAchievements?: readonly RemoteAchievementProjection[] | null;
}

/**
 * Counts only server-issued compute receipts. A null source means the server
 * projection has not been confirmed, so callers must render an unavailable
 * value rather than guessing zero.
 */
export function countRemoteComputeReceipts(
  devices: readonly RemoteDeviceProjection[] | null | undefined,
): number | null {
  if (!devices) return null;
  const receiptNos = new Set<string>();
  for (const device of devices) {
    for (const task of device.recentTasks ?? []) {
      if (typeof task.receiptNo === "string" && task.receiptNo.trim()) receiptNos.add(task.receiptNo.trim());
    }
  }
  return receiptNos.size;
}

/**
 * Points milestones are the server's achievement projection in remote mode.
 * Only terminal claimed/fired statuses count as unlocked achievements.
 */
export function summarizeRemoteAchievements(
  snapshot: RemotePointsProjection | null | undefined,
): { unlocked: number; total: number } | null {
  if (!snapshot || !Array.isArray(snapshot.dailyMilestones)
      || !Array.isArray(snapshot.earningMilestones) || !Array.isArray(snapshot.badgeAchievements)) return null;
  const rows = [...snapshot.dailyMilestones, ...snapshot.earningMilestones, ...snapshot.badgeAchievements];
  return {
    unlocked: rows.filter((row) => row.status === "CLAIMED" || row.status === "FIRED" || row.status === "UNLOCKED").length,
    total: rows.length,
  };
}
