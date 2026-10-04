const twoDigits = (value: number) => String(value).padStart(2, "0");

// Server trial boundaries are epoch milliseconds; use the device's local date
// fields, as Date#toLocaleString did, without Android's English Date fallback.
export function formatTrialDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

export function formatTrialDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${formatTrialDate(timestamp)} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`;
}
