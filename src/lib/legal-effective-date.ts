import { formatCalendarDate } from "./display-date";

/** Present the published calendar date in the selected language, without
 * shifting it across days in the reader's device timezone. No fallback date. */
export function formatLegalEffectiveDate(value: unknown, locale: string): string {
  if (typeof value !== "string") return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return "—";
  return formatCalendarDate(`${match[1]}-${match[2]}-${match[3]}`, locale);
}
