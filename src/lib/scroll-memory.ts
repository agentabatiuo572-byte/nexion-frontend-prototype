// Chassis scroll-position memory — uni H5 keeps stacked pages alive but hides
// them with display:none, which zeroes any INNER container's scrollTop, and
// uni's own back-restore only covers page-level (window) scroll. AppChassis owns
// the real scroll container, so it records its position per page here and
// restores it when the page is re-activated (navigateBack reveal).
// Module-level so it survives page instance teardown; session-scoped by design.

const positions = new Map<string, number>();

export function saveScrollPos(key: string, top: number): void {
  positions.set(key, top);
}

export function getScrollPos(key: string): number | undefined {
  return positions.get(key);
}

/** Fresh forward-navigation lands at top — clear any stale memory for the key. */
export function dropScrollPos(key: string): void {
  positions.delete(key);
}
