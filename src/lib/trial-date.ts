const twoDigits = (value: number) => String(value).padStart(2, "0");

// Server timestamps are epoch milliseconds; use the device's local date
// fields, as Date#toLocaleString did, without Android's English Date fallback.
export function formatTrialDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

export function formatTrialDateTime(timestamp: number): string {
  const day = formatTrialDate(timestamp);
  if (day === "—") return day;
  const date = new Date(timestamp);
  return `${day} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`;
}
