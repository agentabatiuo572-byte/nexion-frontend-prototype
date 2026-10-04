/** Legacy Java LocalDateTime values use the server's Asia/Shanghai business zone. */
export function parseServerTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?$/.exec(raw);
  if (!match) return null;
  const [, y, m, d, h, min, sec, fraction = "", zone = "+08:00"] = match;
  const calendar = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (calendar.getUTCFullYear() !== Number(y) || calendar.getUTCMonth() + 1 !== Number(m)
      || calendar.getUTCDate() !== Number(d) || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) return null;
  const parsed = Date.parse(`${y}-${m}-${d}T${h}:${min}:${sec}${fraction.slice(0, 4)}${zone}`);
  return Number.isFinite(parsed) ? parsed : null;
}
