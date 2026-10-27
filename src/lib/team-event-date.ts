import { teamLogicCopy } from '@/i18n/team-logic-copy';
import { formatDisplayDateTime } from './display-date';

/** API event timestamps are milliseconds. Zero/missing is not a transaction date. */
export function teamEventDate(value: number | null | undefined, locale: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return teamLogicCopy(locale).dateUnavailable;
  const date = formatDisplayDateTime(value, locale);
  return date === '—' ? teamLogicCopy(locale).dateUnavailable : date;
}
