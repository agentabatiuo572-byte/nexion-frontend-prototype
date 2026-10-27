import { formatDisplayDate } from "./display-date";

export function formatJoinedDate(joinedAt: number, locale: string): string {
  if (!Number.isFinite(joinedAt) || joinedAt <= 0) return "—";
  return formatDisplayDate(joinedAt, locale);
}
