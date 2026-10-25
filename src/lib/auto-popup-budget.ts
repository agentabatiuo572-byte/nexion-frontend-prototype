import { readAccountRow, writeAccountRow } from '@/store/account-scoped-storage';

const TABLE = 'nexgrid-auto-popup-day-v1';
/** UI-only budget; this must never gate granting or recording a reward. */
export function claimAutoPopupBudget(accountKey: string, now = Date.now()): boolean {
  if (!accountKey || accountKey === 'default' || !Number.isFinite(now)) return false;
  const day = new Date(now).toISOString().slice(0, 10);
  try {
    if (readAccountRow<{ day: string }>(TABLE, accountKey, true)?.day === day) return false;
    return writeAccountRow(TABLE, accountKey, { day });
  } catch { return false; }
}
