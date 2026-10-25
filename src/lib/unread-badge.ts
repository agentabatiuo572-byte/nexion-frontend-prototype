/** Shared display limit for message badges; the source unread count stays intact. */
export function formatUnreadBadge(count: number | null): string {
  if (count === null) return "—";
  const unread = Number.isFinite(count) ? Math.floor(count) : 0;
  return unread > 0 ? String(Math.min(unread, 99)) : "";
}
