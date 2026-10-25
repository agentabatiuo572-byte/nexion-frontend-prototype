/** Present the published calendar date in the selected language, without
 * shifting it across days in the reader's device timezone. No fallback date. */
export function formatLegalEffectiveDate(value: unknown, locale: string): string {
  if (typeof value !== "string") return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return "—";
  const day = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (day.getUTCFullYear() !== Number(match[1]) || day.getUTCMonth() + 1 !== Number(match[2]) || day.getUTCDate() !== Number(match[3])) return "—";
  // Native runtimes can omit Intl; keep the same date in the three shipped languages.
  const year = day.getUTCFullYear(), month = day.getUTCMonth() + 1, date = day.getUTCDate();
  const language = locale.split("-")[0];
  if (language === "zh") return `${year}年${month}月${date}日`;
  if (language === "vi") return `${date} tháng ${month}, ${year}`;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[month - 1]} ${date}, ${year}`;
}
