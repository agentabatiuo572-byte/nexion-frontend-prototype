/**
 * Keep the editable nickname buffer aligned with the latest server projection
 * without overwriting a candidate the user has already picked.
 */
export function reconcileProfileEdit(
  previousAuthoritative: string,
  editBuffer: string,
  nextAuthoritative: string,
): string {
  return editBuffer === previousAuthoritative ? nextAuthoritative : editBuffer;
}

/**
 * The profile mutation is the primary operation. Quest completion is an
 * independent reward side effect: once the server has saved the nickname, a
 * missing/not-yet-claimable quest must not be reported as a profile failure.
 */
export async function saveProfileAndClaimQuest(
  saveNickname: () => Promise<boolean>,
  claimSetupProfileQuest: () => Promise<boolean>,
): Promise<{ saved: boolean; questPending: boolean }> {
  const saved = await saveNickname();
  if (!saved) return { saved: false, questPending: false };
  const claimed = await claimSetupProfileQuest().catch(() => false);
  return { saved: true, questPending: !claimed };
}
