import { teamLogicCopy } from '@/i18n/team-logic-copy';

/** API event timestamps are milliseconds. Zero/missing is not a transaction date. */
export function teamEventDate(value: number | null | undefined, locale: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return teamLogicCopy(locale).dateUnavailable;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return teamLogicCopy(locale).dateUnavailable;
  const code = locale.split('-')[0];
  return date.toLocaleString(code === 'zh' ? 'zh-CN' : code === 'vi' ? 'vi-VN' : 'en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
