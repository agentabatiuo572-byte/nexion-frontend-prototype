import { formatDisplayDateTime } from "./display-date";

const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Native Android can ignore toLocaleString's locale and options, returning Date.toString().
// Use local calendar fields so the group and row remain consistent with the device time zone.
export function walletBillMonthKey(ts: number): string {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return "invalid";
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "invalid" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function walletBillMonthLabel(ts: number, locale: string): string {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (locale.startsWith("vi")) return `tháng ${month} năm ${year}`;
  if (locale.startsWith("zh")) return `${year}/${String(month).padStart(2, "0")}`;
  return `${EN_MONTHS[month - 1]} ${year}`;
}

export function walletBillTimeLabel(ts: number, locale: string): string {
  return typeof ts === "number" ? formatDisplayDateTime(ts, locale) : "—";
}
