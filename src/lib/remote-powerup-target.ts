const REMOTE_POWERUP_TARGETS = new Map([
  ["/team", "/pages/team/team"],
  ["/me/rewards", "/pages/me/rewards"],
  ["/wallet/staking", "/pages/staking/staking"],
  ["/market/genesis", "/pages/genesis/genesis"],
  ["/pages/team/team", "/pages/team/team"],
  ["/pages/me/rewards", "/pages/me/rewards"],
  ["/pages/me/wallet", "/pages/me/wallet"],
  ["/pages/staking/staking", "/pages/staking/staking"],
  ["/pages/genesis/genesis", "/pages/genesis/genesis"],
]);

/** Only server-provided absolute in-app paths may drive a post-claim jump. */
export function canonicalPowerUpTarget(path: string): string | null {
  const value = path.trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return null;
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  if (decoded.includes("..")) return null;
  return REMOTE_POWERUP_TARGETS.get(value) ?? null;
}
