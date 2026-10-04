import { parseServerTimestamp } from "@/api/server-time";

// Vietnam business time is UTC+7. Numeric UTC fields avoid Android HTML5+
// ignoring Intl locale/timeZone options and falling back to Date.toString().
export function formatBankDateTime(value: string): string {
  const timestamp = parseServerTimestamp(value);
  if (timestamp === null) return "—";
  const date = new Date(timestamp + 7 * 60 * 60 * 1000);
  const two = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())} UTC+7`;
}
