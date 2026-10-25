import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ rows: new Map<string, unknown>(), fail: false }));
vi.mock('@/store/account-scoped-storage', () => ({
  readAccountRow: (_table: string, key: string) => { if(storage.fail) throw new Error('unavailable'); return storage.rows.get(key); },
  writeAccountRow: (_table: string, key: string, row: unknown) => { if(storage.fail) return false; storage.rows.set(key, row); return true; },
}));
import { claimAutoPopupBudget } from './auto-popup-budget';
beforeEach(() => { storage.rows.clear(); storage.fail = false; });
it('allows one automatic interruption per account and UTC day, including remounts', () => {
  const now = Date.UTC(2026,9,25,12);
  expect(claimAutoPopupBudget('A', now)).toBe(true);
  expect(claimAutoPopupBudget('A', now + 1000)).toBe(false);
  expect(claimAutoPopupBudget('B', now)).toBe(true);
  expect(claimAutoPopupBudget('A', now + 86400000)).toBe(true);
});
it('does not open an automatic popup without an account or durable receipt', () => {
  expect(claimAutoPopupBudget('default')).toBe(false);
  storage.fail = true;
  expect(claimAutoPopupBudget('A')).toBe(false);
});
