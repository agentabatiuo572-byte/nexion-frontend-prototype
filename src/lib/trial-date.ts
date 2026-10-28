import { formatDisplayDate, formatDisplayDateTime } from "./display-date";

// Server timestamps are epoch milliseconds; use the device's local date
// fields, as Date#toLocaleString did, without Android's English Date fallback.
export function formatTrialDate(timestamp: number, locale = "zh"): string {
  return typeof timestamp === "number" ? formatDisplayDate(timestamp, locale) : "—";
}

export function formatTrialDateTime(timestamp: number, locale = "zh"): string {
  return typeof timestamp === "number" ? formatDisplayDateTime(timestamp, locale, true) : "—";
}

/** Deadlines in compact rows and chips: minute precision is enough. */
export function formatTrialDeadline(timestamp: number, locale = "zh"): string {
  return typeof timestamp === "number" ? formatDisplayDateTime(timestamp, locale, false) : "—";
}
