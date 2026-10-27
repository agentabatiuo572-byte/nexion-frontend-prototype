import { parseServerTimestamp } from "@/api/server-time";

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (part: number) => String(part).padStart(2, "0");

/** Numbers are API epoch milliseconds; Java timestamps retain their +08:00 contract. */
export function displayTimestamp(value: unknown): number | null {
  const timestamp = typeof value === "number" ? value : parseServerTimestamp(value);
  return timestamp !== null && timestamp > 0 && Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime()) ? timestamp : null;
}

function calendar(year: number, month: number, day: number, locale: string): string {
  if (locale.startsWith("zh")) return `${year}/${two(month)}/${two(day)}`;
  if (locale.startsWith("vi")) return `${two(day)}/${two(month)}/${year}`;
  return `${EN_MONTHS[month - 1]} ${day}, ${year}`;
}

/** A published calendar date is never converted through the device time zone. */
export function formatCalendarDate(value: unknown, locale: string): string {
  if (typeof value !== "string") return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "—";
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return "—";
  return calendar(Number(year), Number(month), Number(day), locale);
}

/** Explicit offsets are display-only: undefined uses the device's local calendar. */
export function formatDisplayDate(value: unknown, locale: string, offsetMinutes?: number): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatCalendarDate(value, locale);
  const timestamp = displayTimestamp(value);
  if (timestamp === null) return "—";
  const date = new Date(timestamp + (offsetMinutes ?? 0) * 60_000);
  if (Number.isNaN(date.getTime())) return "—";
  return offsetMinutes === undefined
    ? calendar(date.getFullYear(), date.getMonth() + 1, date.getDate(), locale)
    : calendar(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), locale);
}

export function formatDisplayTime(value: unknown, seconds = false, offsetMinutes?: number): string {
  const timestamp = displayTimestamp(value);
  if (timestamp === null) return "—";
  const date = new Date(timestamp + (offsetMinutes ?? 0) * 60_000);
  if (Number.isNaN(date.getTime())) return "—";
  const [hour, minute, second] = offsetMinutes === undefined
    ? [date.getHours(), date.getMinutes(), date.getSeconds()]
    : [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
  return `${two(hour)}:${two(minute)}${seconds ? `:${two(second)}` : ""}`;
}

export function formatDisplayDateTime(value: unknown, locale: string, seconds = false, offsetMinutes?: number): string {
  const day = formatDisplayDate(value, locale, offsetMinutes);
  if (day === "—" || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))) return day;
  return `${day} ${formatDisplayTime(value, seconds, offsetMinutes)}`;
}
