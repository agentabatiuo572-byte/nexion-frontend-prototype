import { formatDisplayDateTime } from "./display-date";

// Vietnam business time is UTC+7. Numeric UTC fields avoid Android HTML5+
// ignoring Intl locale/timeZone options and falling back to Date.toString().
export function formatBankDateTime(value: string, locale = "zh"): string {
  const date = formatDisplayDateTime(value, locale, true, 7 * 60);
  return date === "—" ? date : `${date} UTC+7`;
}
