/** Current product badge caps at 99; the stored unread total is never clamped. */
export function formatUnreadBadge(count: number): string {
  return Number.isFinite(count) && count > 0 ? String(Math.min(Math.floor(count), 99)) : "";
}
