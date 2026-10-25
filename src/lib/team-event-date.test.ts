import { expect, it, vi } from 'vitest';
import { teamEventDate } from './team-event-date';
import { teamLogicCopy } from '@/i18n/team-logic-copy';

it.each(['zh', 'en', 'vi'])('formats the actual event milliseconds in %s without consulting the current time', locale => {
  const ts = Date.parse('2026-09-30T16:00:00Z');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-12-31T23:59:00Z'));
  try {
    const displayed = teamEventDate(ts, locale);
    expect(displayed).toContain('2026'); expect(displayed).not.toContain('2099');
    expect(displayed).toBe(new Date(ts).toLocaleString(locale === 'zh' ? 'zh-CN' : locale === 'vi' ? 'vi-VN' : 'en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }));
    expect(clock).not.toHaveBeenCalled();
    for (const value of [undefined, null, 0, -1, NaN, Infinity, 9e18]) expect(teamEventDate(value, locale)).toBe(teamLogicCopy(locale).dateUnavailable);
  } finally { clock.mockRestore(); }
});
