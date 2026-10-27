import { afterEach, expect, it, vi } from 'vitest';
import { teamEventDate } from './team-event-date';
import { teamLogicCopy } from '@/i18n/team-logic-copy';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each([['zh', '2026/10/01 01:00'], ['en', 'Oct 1, 2026 01:00'], ['vi', '01/10/2026 01:00']])('formats actual event milliseconds in %s without native Intl or current time', (locale, expected) => {
  vi.stubEnv('TZ', 'Asia/Tokyo');
  const ts = Date.parse('2026-09-30T16:00:00Z');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-12-31T23:59:00Z'));
  const native = vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(() => { throw new Error('Native locale unavailable'); });
  expect(teamEventDate(ts, locale)).toBe(expected);
  expect(clock).not.toHaveBeenCalled(); expect(native).not.toHaveBeenCalled();
  for (const value of [undefined, null, 0, -1, NaN, Infinity, 9e18]) expect(teamEventDate(value, locale)).toBe(teamLogicCopy(locale).dateUnavailable);
});
