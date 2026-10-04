const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Native Android can ignore toLocaleString's locale and options, returning Date.toString().
// Use local calendar fields so the group and row remain consistent with the device time zone.
export function walletBillMonthKey(ts: number): string {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "invalid" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function walletBillMonthLabel(ts: number, locale: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (locale.startsWith("vi")) return `tháng ${month} năm ${year}`;
  if (locale.startsWith("zh")) return `${year}/${String(month).padStart(2, "0")}`;
  return `${EN_MONTHS[month - 1]} ${year}`;
}

export function walletBillTimeLabel(ts: number, locale: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (locale.startsWith("vi")) return `${day} thg ${month}, ${time}`;
  if (locale.startsWith("zh")) return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")} ${time}`;
  return `${EN_MONTHS[month - 1].slice(0, 3)} ${day}, ${time}`;
}
