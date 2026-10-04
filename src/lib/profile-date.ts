const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatJoinedDate(joinedAt: number, locale: string): string {
  if (!Number.isFinite(joinedAt) || joinedAt <= 0) return "—";
  const value = new Date(joinedAt);
  if (Number.isNaN(value.getTime())) return "—";
  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const day = value.getDate();
  if (locale.startsWith("vi")) return `${day} thg ${month}, ${year}`;
  if (locale.startsWith("zh")) return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
  return `${EN_MONTHS[month - 1]} ${day}, ${year}`;
}
